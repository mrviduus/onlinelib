using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Models.Models;
using System;
using System.Linq;

namespace OnlineLib.DataAccess
{
    public class DatabaseInitializer
    {
        /// <summary>
        /// Initializes database.
        /// </summary>
        /// <param name="connectionString">The database connection string.</param>
        public static void InitializeDatabase(string connectionString)
        {
            using (var context = ApplicationDatabaseContextFactory.CreateContext(connectionString))
            {
                // check if db exist
                if ((context.Database.GetService<IDatabaseCreator>() as RelationalDatabaseCreator).Exists())
                {
                    return;
                }
#if DEBUG
                context.Database.EnsureDeleted();
#endif

                context.Database.Migrate();
                InitializeData(context);
                context.SaveChanges();
            }
        }

        private static void InitializeData(ApplicationDatabaseContext context)
        {
            if (context.Category.Any())
            {
                return;
            }

            var rootId = new Guid("2397cd44-23e5-4925-9371-072de6ddb400");
            var booksId = new Guid("83322f06-6325-4e11-99a4-8df7c726c061");
            var mathematicsId = new Guid("1cd55e0d-67a9-4a5f-8d42-eaaa72c5796e");
            var fictionsId = new Guid("41b28736-e27c-4a5f-bf7c-3f90e3fc7b39");
            var articlesId = new Guid("ac6b1480-47c8-41b9-843c-9979340d3715");

            var root = new Category()
            {
                Id = rootId,
                Name = "root",
                Description = "Root",
                ParentId = null
            };

            var books = new Category()
            {
                Id = booksId,
                Name = "books",
                Description = "books",
                ParentId = rootId,
            };

            var mathematics = new Category()
            {
                Id = mathematicsId,
                Name = "Mathematics",
                Description = "Mathematics",
                ParentId = booksId,
            };

            var fictions = new Category()
            {
                Id = fictionsId,
                Name = "Fictions",
                Description = "Fictions",
                ParentId = booksId,
            };

            var articles = new Category()
            {
                Id = articlesId,
                Name = "Articles",
                Description = "Articles",
                ParentId = rootId,
            };

            context.Category.AddRange(new[] { root, books, mathematics, fictions, articles });

            var testArticle = new Article()
            {
                Id = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c"),
                Title = "ArticleTest",
                Summary = "SummeryTest",
                HtmlContent = "<H1>Hello world</H1>",
                MarkdownContent = "MarkdownContentTest",
                CategoryId = new Guid("ac6b1480-47c8-41b9-843c-9979340d3715"),
                IsPublished = true,
                CreationTime = new DateTime(),
                PageName = "PagenameTest",
                Cover = "CoverTest",
                ContentLanguage = "en",
                Views = 0,
                Likes = 0,
            };

            context.Article.AddRange(new[] { testArticle });

            var testComment = new Comment()
            {
                Id = new Guid("9accfae2-0872-49db-9356-08d8aa9d180d"),
                ArticleId = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c"),
                Content = "Test",
            };

            context.Comment.AddRange(new[] { testComment });

            context.SaveChanges();

            var testAuthor = new Author()
            {
                Id = new Guid("5dad58ce-87c8-487e-9aa8-ba557695b092"),
                FirstName = "Victor",
                LastName = "Pelevin",
                Biography = "Some text",
                BirthDate = DateTime.Now,
                Icon = null,
            };
        }
    }
}
