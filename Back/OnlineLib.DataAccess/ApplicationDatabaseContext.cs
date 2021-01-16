using Microsoft.EntityFrameworkCore;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;

namespace OnlineLib.DataAccess
{
    public class ApplicationDatabaseContext : DbContext
    {
        public ApplicationDatabaseContext(DbContextOptions<ApplicationDatabaseContext> options)
            : base(options) { }

        public DbSet<Account> Accounts { get; set; }

        public DbSet<Category> Category { get; set; }

        public DbSet<Article> Article { get; set; }

        public DbSet<ArticleSEO> ArticleSEO { get; set; }

        public DbSet<ArticleTag> ArticleTag { get; set; }

        public DbSet<Attachment> Attachment { get; set; }

        public DbSet<Comment> Comment { get; set; }

        public DbSet<Tag> Tag { get; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Category
            modelBuilder.Entity<Category>().HasKey(x => x.Id);
            modelBuilder.Entity<Category>().Property(x => x.Name);
            modelBuilder.Entity<Category>().Property(x => x.Description);
            modelBuilder.Entity<Category>().HasMany(x => x.Children)
                .WithOne(x => x.Parent)
                .HasForeignKey(x => x.ParentId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            // Article
            modelBuilder.Entity<Article>().HasKey(x => x.Id);
            modelBuilder.Entity<Article>().Property(x => x.Title).HasMaxLength(100);
            modelBuilder.Entity<Article>().Property(x => x.ContentLanguage).HasMaxLength(10);
            modelBuilder.Entity<Article>().Property(x => x.Summary).HasMaxLength(500);
            modelBuilder.Entity<Article>().Property(x => x.HtmlContent);
            modelBuilder.Entity<Article>().HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId);
            //modelBuilder.Entity<Article>().HasMany(x => x.Attachments).WithOne().HasForeignKey(x => x.ArticleId);
            modelBuilder.Entity<Article>().HasMany(x => x.Comments).WithOne().HasForeignKey(x => x.ArticleId);
            modelBuilder.Entity<Article>().Property(x => x.IsPublished);

            // ArticleSEO
            modelBuilder.Entity<ArticleSEO>().HasKey(x => x.Id);
            modelBuilder.Entity<ArticleSEO>().HasOne(x => x.Article).WithMany().HasForeignKey(x => x.ArticleId);
            modelBuilder.Entity<ArticleSEO>().Property(x => x.Title).HasMaxLength(100);

            // Attachment
            modelBuilder.Entity<Attachment>().HasKey(x => x.Id);

            // Comments
            modelBuilder.Entity<Comment>().HasKey(x => x.Id);
            //modelBuilder.Entity<Comment>().HasOne(x => x.Article).WithMany().HasForeignKey(x => x.ArticleId);
            modelBuilder.Entity<Comment>().HasMany(x => x.Replies).WithOne().HasForeignKey(x => x.ReplyTo);
        }
    }
}