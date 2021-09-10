using Microsoft.EntityFrameworkCore;
using OnlineLib.Domain.Entities.Book;
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

        public DbSet<Tag> Tag { get; set; }

        public DbSet<Author> Author { get; set; }

        public DbSet<Book> Book { get; set; }

        public DbSet<BookSEO> BookSEO { get; set; }

        public DbSet<BookTag> BookTag { get; set; }

        public DbSet<Impressions> Impressions { get; set; }

        public DbSet<Quotes> Quotes { get; set; }

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

            //Author
            modelBuilder.Entity<Author>().HasKey(x => x.Id);

            // Book
            modelBuilder.Entity<Book>().HasKey(x => x.Id);
            modelBuilder.Entity<Book>().Property(x => x.Title).HasMaxLength(100);
            modelBuilder.Entity<Book>().Property(x => x.ContentLanguage).HasMaxLength(10);
            modelBuilder.Entity<Book>().Property(x => x.Summary).HasMaxLength(500);
            modelBuilder.Entity<Book>().Property(x => x.Content);
            modelBuilder.Entity<Book>().Property(x => x.Likes);
            modelBuilder.Entity<Book>().Property(x => x.IBSN);
            modelBuilder.Entity<Book>().Property(x => x.Pages);
            modelBuilder.Entity<Book>().Property(x => x.Year);

            modelBuilder.Entity<Book>().HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId);
            modelBuilder.Entity<Book>().HasOne(x => x.Author).WithMany().HasForeignKey(x => x.AuthorId);

            modelBuilder.Entity<Book>().HasMany(x => x.Impressions).WithOne().HasForeignKey(x => x.BookId);
            modelBuilder.Entity<Book>().HasMany(x => x.Quotes).WithOne().HasForeignKey(x => x.BookId);
            modelBuilder.Entity<Book>().Property(x => x.IsPublished);

            //BookSEO
            modelBuilder.Entity<BookSEO>().HasKey(x => x.Id);
            modelBuilder.Entity<BookSEO>().HasOne(x => x.Book).WithMany().HasForeignKey(x => x.BookId);
            modelBuilder.Entity<BookSEO>().Property(x => x.Title).HasMaxLength(100);

            //Impressions
            modelBuilder.Entity<Impressions>().HasKey(x => x.Id);

            //Quotes
            modelBuilder.Entity<Quotes>().HasKey(x => x.Id);

        }
    }
}