namespace TextStack.Vocabulary;

public static class DistractorWords
{
    public static readonly string[] English =
    [
        "house", "water", "night", "morning", "garden", "window", "silence",
        "shadow", "bridge", "forest", "river", "mountain", "village", "castle",
        "cloud", "storm", "flame", "mirror", "journey", "dream", "treasure",
        "wisdom", "freedom", "danger", "mystery", "battle", "kingdom", "spirit",
        "courage", "destiny"
    ];

    public static readonly string[] German =
    [
        "Haus", "Wasser", "Nacht", "Morgen", "Garten", "Fenster", "Stille",
        "Schatten", "Brücke", "Wald", "Fluss", "Berg", "Dorf", "Schloss",
        "Wolke", "Sturm", "Flamme", "Spiegel", "Reise", "Traum", "Schatz",
        "Weisheit", "Freiheit", "Gefahr", "Geheimnis", "Schlacht", "Königreich", "Geist",
        "Mut", "Schicksal"
    ];

    public static readonly string[] French =
    [
        "maison", "eau", "nuit", "matin", "jardin", "fenêtre", "silence",
        "ombre", "pont", "forêt", "rivière", "montagne", "village", "château",
        "nuage", "tempête", "flamme", "miroir", "voyage", "rêve", "trésor",
        "sagesse", "liberté", "danger", "mystère", "bataille", "royaume", "esprit",
        "courage", "destin"
    ];

    public static readonly string[] Spanish =
    [
        "casa", "agua", "noche", "mañana", "jardín", "ventana", "silencio",
        "sombra", "puente", "bosque", "río", "montaña", "pueblo", "castillo",
        "nube", "tormenta", "llama", "espejo", "viaje", "sueño", "tesoro",
        "sabiduría", "libertad", "peligro", "misterio", "batalla", "reino", "espíritu",
        "valor", "destino"
    ];

    public static string[] ForLanguage(string language) =>
        language.ToLowerInvariant() switch
        {
            "de" or "german" => German,
            "fr" or "french" => French,
            "es" or "spanish" => Spanish,
            _ => English,
        };
}
