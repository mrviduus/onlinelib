using HdbscanSharp.Runner;

namespace TextStack.Vocabulary;

/// <summary>
/// AI-058: pure, deterministic semantic clusterer over word embeddings. Groups a single
/// user's vocabulary by meaning using real <b>HDBSCAN*</b> density clustering via the
/// <c>HdbscanSharp</c> NuGet package (MIT). Replaced the original hand-rolled
/// cosine-threshold union-find — HDBSCAN finds variable-density clusters and labels
/// low-density points as noise (no global similarity floor to hand-tune).
///
/// Framework-free and side-effect-free — no DB, no embedding calls. The expected input is
/// ≤300 1536-dim vectors per user, so the in-memory pairwise distance pass HDBSCAN walks is
/// cheap and stays fully in process.
///
/// Distance: we L2-normalize each vector once and feed HDBSCAN <b>Euclidean distance over the
/// unit vectors</b>. On unit vectors, squared-Euclidean = 2·(1 − cosine), so Euclidean is a
/// strictly monotonic function of cosine distance — clustering by it is equivalent to clustering
/// by cosine, which matches our pgvector <c>vector_cosine_ops</c> choice. (HdbscanSharp ships a
/// <c>CosineSimilarity</c> calculator, but that returns a *similarity* whereas HDBSCAN needs a
/// *distance*; normalizing + Euclidean gives a clean, correct distance with no sign flip.)
///
/// HDBSCAN params (verified against the installed HdbscanSharp 3.0.1 assembly):
///   <c>HdbscanRunner.Run(datasetCount, minPoints, minClusterSize, Func&lt;int,int,double&gt; distance,
///   constraints: null)</c> → <c>HdbscanResult.Labels</c> (one int per point). Noise label is
///   <b>0</b>; real clusters get positive labels (2, 3, …). We map label 0 → unclustered (absent
///   from the result) and group each positive label into a <see cref="SemanticCluster"/>.
///
/// <c>minPoints</c> (HDBSCAN's k / "min samples", controlling how conservative the density
/// estimate is) defaults to <c>minClusterSize</c>; both are settable via the ctor.
///
/// Cohesion = mean intra-cluster pairwise cosine similarity (= dot product of the unit vectors).
/// </summary>
public sealed class SemanticClusterer
{
    public const int DefaultMinClusterSize = 3;

    private readonly int _minClusterSize;
    private readonly int _minPoints;

    /// <param name="minClusterSize">Smallest group HDBSCAN will emit as a cluster (default 3).</param>
    /// <param name="minPoints">
    /// HDBSCAN k / "min samples" — neighborhood size for the density estimate. Larger = more
    /// conservative (more points become noise). Defaults to <paramref name="minClusterSize"/>.
    /// </param>
    public SemanticClusterer(int minClusterSize = DefaultMinClusterSize, int? minPoints = null)
    {
        _minClusterSize = Math.Max(1, minClusterSize);
        _minPoints = Math.Max(1, minPoints ?? _minClusterSize);
    }

    /// <summary>
    /// Clusters the given points by cosine distance using HDBSCAN. Returns one
    /// <see cref="SemanticCluster"/> per density cluster (size ≥ minClusterSize). Points HDBSCAN
    /// labels as noise are simply absent from the result. Deterministic for a given input ordering.
    /// </summary>
    public IReadOnlyList<SemanticCluster> Cluster(IReadOnlyList<(Guid Id, float[] Vector)> points)
    {
        var n = points.Count;

        // Edge case: HDBSCAN cannot form any cluster below minClusterSize points — short-circuit
        // to empty rather than letting the runner return all-noise (and avoid any tiny-N quirks).
        if (n < _minClusterSize)
            return [];

        // 1. L2-normalize each vector once so Euclidean distance ≡ cosine distance (monotonic).
        var normalized = new double[n][];
        for (var i = 0; i < n; i++)
            normalized[i] = Normalize(points[i].Vector);

        // 2. Run HDBSCAN. Distance is Euclidean over the unit vectors. Clamp minPoints to n so a
        //    k larger than the dataset can't trip the density estimate.
        var minPoints = Math.Min(_minPoints, n);
        var minClusterSize = Math.Min(_minClusterSize, n);

        int[] labels;
        try
        {
            var result = HdbscanRunner.Run(
                datasetCount: n,
                minPoints: minPoints,
                minClusterSize: minClusterSize,
                distanceFunc: (i, j) => EuclideanDistance(normalized[i], normalized[j]),
                constraints: null);
            labels = result.Labels;
        }
        catch
        {
            // HDBSCAN can throw on degenerate inputs (e.g. all-identical / collapsed graphs).
            // Treat that as "no clusters" rather than failing the whole rebuild.
            return [];
        }

        if (labels is null || labels.Length != n)
            return [];

        // 3. Group point indices by label. Label 0 == noise → drop (left unclustered upstream).
        var groups = new Dictionary<int, List<int>>();
        for (var i = 0; i < n; i++)
        {
            var label = labels[i];
            if (label == 0)
                continue; // noise

            if (!groups.TryGetValue(label, out var list))
                groups[label] = list = [];
            list.Add(i);
        }

        // 4. Materialize clusters. Guard the size floor again (HDBSCAN respects it, but be defensive)
        //    and compute mean intra-cluster cosine cohesion.
        var result2 = new List<SemanticCluster>();
        foreach (var members in groups.Values)
        {
            if (members.Count < _minClusterSize)
                continue;

            var cohesion = MeanPairwiseSimilarity(members, normalized);
            var wordIds = members.Select(idx => points[idx].Id).ToList();
            result2.Add(new SemanticCluster(wordIds, cohesion));
        }

        return result2;
    }

    private static double MeanPairwiseSimilarity(List<int> members, double[][] normalized)
    {
        if (members.Count < 2)
            return 1.0; // a lone member is trivially cohesive (only reachable if minClusterSize==1).

        double sum = 0;
        var count = 0;
        for (var i = 0; i < members.Count; i++)
        {
            for (var j = i + 1; j < members.Count; j++)
            {
                sum += Dot(normalized[members[i]], normalized[members[j]]);
                count++;
            }
        }

        return sum / count;
    }

    private static double[] Normalize(float[] v)
    {
        double sumSq = 0;
        for (var i = 0; i < v.Length; i++)
            sumSq += (double)v[i] * v[i];

        var norm = Math.Sqrt(sumSq);
        var result = new double[v.Length];
        if (norm <= 1e-12)
            return result; // zero vector → stays zero (max distance to any unit vector).

        var inv = 1.0 / norm;
        for (var i = 0; i < v.Length; i++)
            result[i] = v[i] * inv;
        return result;
    }

    private static double EuclideanDistance(double[] a, double[] b)
    {
        double sum = 0;
        var len = Math.Min(a.Length, b.Length);
        for (var i = 0; i < len; i++)
        {
            var d = a[i] - b[i];
            sum += d * d;
        }
        return Math.Sqrt(sum);
    }

    private static double Dot(double[] a, double[] b)
    {
        double sum = 0;
        var len = Math.Min(a.Length, b.Length);
        for (var i = 0; i < len; i++)
            sum += a[i] * b[i];
        return sum;
    }
}

/// <summary>A surviving concept cluster: its member word ids + mean intra-cluster cosine.</summary>
public sealed record SemanticCluster(IReadOnlyList<Guid> WordIds, double Cohesion);
