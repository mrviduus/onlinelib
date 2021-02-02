using AutoMapper;
using Moq;
using OnlineLib.BusinessLogic.Managers;
using OnlineLib.BusinessLogic.Managers.Admin;
using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using OnlineLib.WebService.Configuration;
using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Text;
using Xunit;

namespace OnlineLib.BusinessLogicTests1.Managers
{
    public class AdminManagerTests
    {
        #region Category
        [Fact]
        public void GetCategoryByIdTest()
        {
            // Arrage
            var id = new Guid("2397cd44-23e5-4925-9371-072de6ddb400");
            var expected = new Category()
            {
                Id = id,
                Name = "root",
                Description = "Root",
                ParentId = null
            };

            var mockCategoryRepo = new Mock<ICategoryRepository>();
            mockCategoryRepo.Setup(repo => repo.GetByID(It.IsAny<Guid>()))
                .Returns(expected);

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CategoryRepository)
                .Returns(mockCategoryRepo.Object);

            
            

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CategoryManager(mockUow.Object, mapper);


            // Act
            var actual = manager.GetById(id);

            // Assert
            Assert.Equal(id, actual.Result.Id);
            Assert.Equal("root", actual.Result.Name);
        }

        [Fact]
        public void CreateOrUpdateCategoryTest()
        {
            // Arrage
            var rootId = new Guid("2397cd44-23e5-4925-9371-072de6ddb400");

            var mockCategoryRepo = new Mock<ICategoryRepository>();
            mockCategoryRepo.Setup(x => x.InsertOrUpdate(It.IsAny<Category>()));

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CategoryRepository)
                .Returns(mockCategoryRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CategoryManager(mockUow.Object, mapper);

            var categoryDTO = new CategoryDTO
            {
                Id = rootId,
                //Icon = "string",
                Name = "root",
                Description = "Root",
                ParentId = null
            };

            // Act
            var actual = manager.CreateOrUpdate(categoryDTO);

            // Assert
            mockCategoryRepo.Verify(x => x.InsertOrUpdate(It.IsAny<Category>()), Times.Once);
            mockUow.Verify(uow => uow.Save(), Times.Once);
            
            //Assert.Equal(categoryDTO.Name,);
        }

        [Fact]
        public void DeleteCategoriesTest()
        {
            //Arrage
            var rootId = new Guid("2397cd44-23e5-4925-9371-072de6ddb400");

            var mockCategoryRepo = new Mock<ICategoryRepository>();
            mockCategoryRepo.Setup(repo => repo.DeleteCategories(It.IsAny<List<Guid>>()));

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CategoryRepository)
                .Returns(mockCategoryRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CategoryManager(mockUow.Object, mapper);

            //var ids = new List<Guid>()
            //{
            //    rootId,
            //};
            var id = new Guid();

            // Act
            var actual = manager.Delete(id);

            // Assert
            mockCategoryRepo.Verify(x => x.Delete(It.IsAny<Guid>()));
            mockUow.Verify(uow => uow.Save(), Times.Once);
        }
        #endregion Category

        #region Article
        [Fact]
        public void GetArticleByIdTest()
        {
            // Arrage
            var id = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c");
            var expected = new Article()
            {
                Id = id,
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

            var mockArticleRepo = new Mock<IArticleRepository>();
            mockArticleRepo.Setup(repo => repo.GetByID(It.IsAny<Guid>()))
                .Returns(expected);

            var mockArticleTagRepo = new Mock<IArticleTagRepository>();

            var mockTagRepo = new Mock<ITagRepository>();

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.ArticleRepository)
                .Returns(mockArticleRepo.Object);

            mockUow.Setup(repo => repo.ArticleTagRepository)
                .Returns(mockArticleTagRepo.Object);

            mockUow.Setup(repo => repo.TagRepository)
                .Returns(mockTagRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new ArticleManager(mockUow.Object, mapper);


            // Act
            var actual = manager.GetById(id);

            // Assert
            Assert.Equal(id, actual.Result.Id);
            Assert.Equal("ArticleTest", actual.Result.Title);
            
        }

        [Fact]
        public void DeleteArticleTest()
        {
            // Arrage
            var id = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c");

            var mockArticleRepo = new Mock<IArticleRepository>();
            mockArticleRepo.Setup(repo => repo.Delete(It.IsAny<Guid>()));

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.ArticleRepository)
                .Returns(mockArticleRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new ArticleManager(mockUow.Object, mapper);


            // Act

            var actual = manager.Delete(id);

            // Assert

            mockArticleRepo.Verify(x => x.Delete(It.IsAny<Guid>()), Times.Once);
            mockUow.Verify(x => x.Save(), Times.Once);
        }

        [Fact]
        public void CreateOrUpdateArticleTest()
        {
            // Arrage
            var id = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c");
            var expected = new ArticleDTO()
            {
                Id = id,
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

            var mockArticleRepo = new Mock<IArticleRepository>();

            var mockArticleTagRepo = new Mock<IArticleTagRepository>();

            var mockArticleSEO = new Mock<IArticleSEORepository>();

            var mockTagRepo = new Mock<ITagRepository>();

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.ArticleRepository)
                .Returns(mockArticleRepo.Object);

            mockUow.Setup(repo => repo.ArticleTagRepository)
                .Returns(mockArticleTagRepo.Object);

            mockUow.Setup(repo => repo.TagRepository)
                .Returns(mockTagRepo.Object);

            mockUow.Setup(repo => repo.ArticleSEORepository)
                .Returns(mockArticleSEO.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });

            IMapper mapper = mockMapper.CreateMapper();

            var manager = new ArticleManager(mockUow.Object, mapper);

            // Act

            var actual = manager.CreateOrUpdate(expected);

            // Assert

            mockArticleRepo.Verify(x => x.InsertOrUpdate(It.IsAny<Article>()));
            // To Do
            //mockArticleTagRepo.Verify(x => x.Insert(It.IsAny<Article>()));
            mockUow.Verify(x => x.Save());
        }

        #endregion Article

        #region Comments
        [Fact]
        public void CreateOrUpdateCommentTest()
        {
            // Arrage
            var commentDto = new CommentDTO()
            {
                Id = new Guid("9accfae2-0872-49db-9356-08d8aa9d180d"),
                ArticleId = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c"),
                Content = "Test",
            };

            var mockCommentsRepo = new Mock<ICommentsRepository>();

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CommentsRepository)
                .Returns(mockCommentsRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CommentManager(mockUow.Object, mapper);

            // Act

            var actual = manager.CreateOrUpdate(commentDto);

            // Assert

            mockCommentsRepo.Verify(x => x.InsertOrUpdate(It.IsAny<Comment>()), Times.Once);
            mockUow.Verify(x => x.Save(), Times.Once);
        }

        [Fact]
        public void DeleteCommentsTest()
        {
            var Id = new Guid("9accfae2-0872-49db-9356-08d8aa9d180d");

            var mockCommentsRepo = new Mock<ICommentsRepository>();
            mockCommentsRepo.Setup(repo => repo.DeleteComments(It.IsAny<List<Guid>>()));

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CommentsRepository)
                .Returns(mockCommentsRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CommentManager(mockUow.Object, mapper);

            var ids = new List<Guid>()
            {
                Id,
            };

            // Act
            var actual = manager.DeleteComments(ids);

            // Assert
            mockCommentsRepo.Verify(x => x.DeleteComments(It.IsAny<List<Guid>>()));
            mockUow.Verify(uow => uow.Save(), Times.Once);
        }

        [Fact]
        public void GetCommentTest()
        {
            // Arrage
            var id = new Guid("9accfae2-0872-49db-9356-08d8aa9d180d");
            var comment = new Comment()
            {
                Id = id,
                ArticleId = new Guid("5d3e7d9f-66c2-4d3d-084e-08d8aa7ba44c"),
                Content = "Test",
            };

            var mockCommentsRepo = new Mock<ICommentsRepository>();
            mockCommentsRepo.Setup(repo => repo.GetByID(It.IsAny<Guid>()))
                .Returns(comment);

            var mockUow = new Mock<IUnitOfWork>();
            mockUow.Setup(repo => repo.CommentsRepository)
                .Returns(mockCommentsRepo.Object);

            var mockMapper = new MapperConfiguration(cfg =>
            {
                cfg.AddProfile(new AutoMapperProfile()); //your automapperprofile 
            });
            IMapper mapper = mockMapper.CreateMapper();

            var manager = new CommentManager(mockUow.Object, mapper);

            // Act

            var actual = manager.GetById(id);

            // Assert
            Assert.Equal(id, comment.Id);
            Assert.Equal("Test", comment.Content);
        }

        #endregion Comments
    }
}
