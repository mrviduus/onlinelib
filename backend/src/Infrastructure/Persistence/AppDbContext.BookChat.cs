using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Persistence;

/// <summary>
/// Persistent Book Chat (NotebookLM-style). <see cref="BookConversation"/> (table
/// <c>book_conversation</c>) — one row per user + book, holding server-owned chat state; its turns live
/// in <see cref="ConversationMessage"/> (table <c>conversation_message</c>). snake_case names come from
/// the global convention (OnConfiguring). Mirrors the <c>TutorSession</c> mapping (ISiteScoped filter,
/// jsonb, cascade FKs).
/// </summary>
public partial class AppDbContext
{
    // Instance (not static): the query filters close over _currentSite.
    private void ConfigureBookChat(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BookConversation>(e =>
        {
            e.ToTable("book_conversation", t =>
                // Exactly one of edition_id / user_book_id is set (a conversation is about one book).
                t.HasCheckConstraint(
                    "ck_book_conversation_target",
                    "(edition_id IS NOT NULL AND user_book_id IS NULL) OR (edition_id IS NULL AND user_book_id IS NOT NULL)"));

            e.Property(x => x.Summary).HasColumnType("text");
            e.Property(x => x.SummarizedThroughOrd).HasDefaultValue(0);
            e.Property(x => x.SpoilerGateEnabled).HasDefaultValue(true);

            // One conversation per user + book (NotebookLM model). Filtered so the NULL side of the XOR
            // doesn't collide across the other book type's rows.
            e.HasIndex(x => new { x.UserId, x.EditionId })
                .IsUnique()
                .HasFilter("edition_id IS NOT NULL");
            e.HasIndex(x => new { x.UserId, x.UserBookId })
                .IsUnique()
                .HasFilter("user_book_id IS NOT NULL");

            e.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Site)
                .WithMany()
                .HasForeignKey(x => x.SiteId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.Edition)
                .WithMany()
                .HasForeignKey(x => x.EditionId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(x => x.UserBook)
                .WithMany()
                .HasForeignKey(x => x.UserBookId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasMany(x => x.Messages)
                .WithOne(m => m.Conversation)
                .HasForeignKey(m => m.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasQueryFilter(x => x.SiteId == _currentSite.Id);
        });

        modelBuilder.Entity<ConversationMessage>(e =>
        {
            e.ToTable("conversation_message");

            // Hot query: a conversation's turns in order (history load + next-ord computation).
            // UNIQUE so two concurrent POSTs can't both claim the same ord (data-corruption guard):
            // the loser gets a 23505 and PostMessage recomputes maxOrd + retries.
            e.HasIndex(x => new { x.ConversationId, x.Ord }).IsUnique();

            e.Property(x => x.Role).HasMaxLength(16);
            e.Property(x => x.Content).HasColumnType("text");
            e.Property(x => x.CitationsJson).HasColumnType("jsonb");

            // Match the parent's site filter (reached only via a site-scoped conversation) so EF doesn't
            // warn about a filtered principal with an unfiltered dependent.
            e.HasQueryFilter(x => x.Conversation.SiteId == _currentSite.Id);
        });
    }
}
