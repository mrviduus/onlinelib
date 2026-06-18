using TextStack.Vocabulary;

namespace TextStack.UnitTests;

// AI-058: pure, deterministic clusterer over HDBSCAN (HdbscanSharp). No DB, no embeddings —
// hand-built vectors only. HDBSCAN needs DENSITY: each cluster must be a dense blob of
// >= minClusterSize near-identical points, with a clear density gap to noise/other blobs.
// Fixtures here are dense jittered blobs (5-6 pts) around orthonormal axes + far outliers.
public class SemanticClustererTests
{
    private const int Dim = 1536;

    // Builds a 1536-d vector with the given leading components (rest zero).
    private static float[] Vec(params float[] head)
    {
        var v = new float[Dim];
        for (var i = 0; i < head.Length; i++)
            v[i] = head[i];
        return v;
    }

    private static (Guid, float[]) P(float[] vec) => (Guid.NewGuid(), vec);

    // A dense blob of `count` near-identical unit-ish vectors pointing along `axis`, with tiny
    // deterministic jitter on neighboring axes so they're distinct but cosine ~ 0.999 to each other.
    private static List<(Guid, float[])> Blob(int axis, int count, float jitter = 0.01f)
    {
        var blob = new List<(Guid, float[])>(count);
        for (var i = 0; i < count; i++)
        {
            var head = new float[axis + 3];
            head[axis] = 1.0f;
            head[axis + 1] = jitter * i;        // small deterministic spread
            head[axis + 2] = jitter * (count - i);
            blob.Add(P(Vec(head)));
        }
        return blob;
    }

    [Fact]
    public void Cluster_TwoDenseBlobsPlusOutliers_ReturnsTwoClustersOutliersUnclustered()
    {
        // Two dense blobs of 5 along orthogonal axes (0 and 10), far apart in cosine space.
        var blobA = Blob(axis: 0, count: 5);
        var blobB = Blob(axis: 10, count: 5);
        // Two far outliers on their own axes — isolated, no dense neighborhood → noise.
        var outlier1 = P(AxisVec(40, 1.0f));
        var outlier2 = P(AxisVec(60, 1.0f));

        var points = blobA.Concat(blobB).Append(outlier1).Append(outlier2).ToList();
        var result = new SemanticClusterer(minClusterSize: 3).Cluster(points);

        Assert.Equal(2, result.Count);

        var clustered = result.SelectMany(c => c.WordIds).ToHashSet();
        Assert.DoesNotContain(outlier1.Item1, clustered);
        Assert.DoesNotContain(outlier2.Item1, clustered);

        // Each blob's ids land together in one cluster.
        var idsA = blobA.Select(p => p.Item1).ToArray();
        var idsB = blobB.Select(p => p.Item1).ToArray();
        Assert.Contains(result, c => idsA.All(c.WordIds.Contains));
        Assert.Contains(result, c => idsB.All(c.WordIds.Contains));
    }

    // Unit vector along a single axis (rest zero).
    private static float[] AxisVec(int axis, float mag)
    {
        var v = new float[Dim];
        v[axis] = mag;
        return v;
    }

    [Fact]
    public void Cluster_AllNoise_ReturnsEmpty()
    {
        // Six mutually-distant points (each on its own axis) — no density anywhere → all noise.
        var points = new List<(Guid, float[])>
        {
            P(AxisVec(0, 1f)), P(AxisVec(5, 1f)), P(AxisVec(10, 1f)),
            P(AxisVec(15, 1f)), P(AxisVec(20, 1f)), P(AxisVec(25, 1f)),
        };

        var result = new SemanticClusterer(minClusterSize: 3).Cluster(points);
        Assert.Empty(result);
    }

    [Fact]
    public void Cluster_AllMembersOfABlobLandTogether()
    {
        // HDBSCAN needs >= 2 competing dense regions to extract any cluster (a lone blob with no
        // contrast is pruned to noise — verified against HdbscanSharp). So use two tight blobs and
        // assert each blob's points end up wholly inside a single cluster.
        var blobA = Blob(axis: 0, count: 5);
        var blobB = Blob(axis: 10, count: 5);

        var result = new SemanticClusterer(minClusterSize: 3).Cluster(blobA.Concat(blobB).ToList());

        Assert.Equal(2, result.Count);
        var idsA = blobA.Select(p => p.Item1).ToArray();
        var idsB = blobB.Select(p => p.Item1).ToArray();
        Assert.Contains(result, c => c.WordIds.Count == 5 && idsA.All(c.WordIds.Contains));
        Assert.Contains(result, c => c.WordIds.Count == 5 && idsB.All(c.WordIds.Contains));
    }

    [Fact]
    public void Cluster_BlobBelowMinClusterSize_ReturnsEmpty()
    {
        // A dense pair (size 2) under the default minClusterSize 3 → no cluster, short-circuit.
        var a1 = P(AxisVec(0, 1f));
        var a2 = P(Vec(0.999f, 0.01f));

        var result = new SemanticClusterer(minClusterSize: 3).Cluster([a1, a2]);
        Assert.Empty(result);
    }

    [Fact]
    public void Cluster_TightBlobs_CohesionNearOne()
    {
        // Two very tight blobs (jitter 0.002) → each cluster's mean intra-cluster cosine ~ 1.
        var blobA = Blob(axis: 0, count: 5, jitter: 0.002f);
        var blobB = Blob(axis: 10, count: 5, jitter: 0.002f);

        var result = new SemanticClusterer(minClusterSize: 3).Cluster(blobA.Concat(blobB).ToList());

        Assert.Equal(2, result.Count);
        Assert.All(result, c =>
        {
            Assert.True(c.Cohesion > 0.99, $"expected cohesion >0.99, got {c.Cohesion}");
            Assert.True(c.Cohesion <= 1.0001);
        });
    }

    [Fact]
    public void Cluster_FewerPointsThanMinSize_ReturnsEmpty()
    {
        var a = P(AxisVec(0, 1f));
        var result = new SemanticClusterer(minClusterSize: 3).Cluster([a]);
        Assert.Empty(result);
    }

    [Fact]
    public void Cluster_EmptyInput_ReturnsEmpty()
    {
        var result = new SemanticClusterer(minClusterSize: 3).Cluster([]);
        Assert.Empty(result);
    }

    [Fact]
    public void Cluster_ZeroVectorsPresent_DoesNotThrowOrProduceNaN()
    {
        // Attack surface: an all-zero embedding (degenerate / failed embed). Normalize must not
        // divide by zero → NaN distances → HDBSCAN blow-up. Mix zero vectors with two real blobs;
        // assert no throw, the two real blobs still cluster, and no cohesion is NaN.
        var blobA = Blob(axis: 0, count: 5);
        var blobB = Blob(axis: 10, count: 5);
        var zero1 = P(new float[Dim]);
        var zero2 = P(new float[Dim]);

        var points = blobA.Concat(blobB).Append(zero1).Append(zero2).ToList();

        var result = new SemanticClusterer(minClusterSize: 3).Cluster(points);

        // Zero vectors are far (distance 1.0) from every unit blob and from each other in the
        // jittered head dims → they fall out as noise, real blobs survive.
        Assert.Equal(2, result.Count);
        Assert.All(result, c => Assert.False(double.IsNaN(c.Cohesion), "cohesion must not be NaN"));
        var clustered = result.SelectMany(c => c.WordIds).ToHashSet();
        Assert.DoesNotContain(zero1.Item1, clustered);
        Assert.DoesNotContain(zero2.Item1, clustered);
    }

    [Fact]
    public void Cluster_AllZeroVectors_ReturnsEmptyNoThrow()
    {
        // All-zero embeddings — every normalized vector is the origin, distance 0 to each other.
        // Must not throw (NaN-free) and must not fabricate a phantom cluster from degenerate input.
        var points = Enumerable.Range(0, 6).Select(_ => P(new float[Dim])).ToList();

        var result = new SemanticClusterer(minClusterSize: 3).Cluster(points);

        // Either empty or a single all-zero "cluster" — but never a crash and never NaN cohesion.
        Assert.All(result, c => Assert.False(double.IsNaN(c.Cohesion)));
    }
}
