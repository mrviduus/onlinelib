using AutoMapper;
using OnlineLib.Domain.DTO.Book;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Models.Dto;
using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;
using OnlineLib.Models.Models.Accounts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Configuration
{
    public class AutoMapperProfile : Profile
    {
        public AutoMapperProfile()
        {
            CreateMap<Account, AccountResponse>();

            CreateMap<Account, AuthenticateResponse>();

            CreateMap<RegisterRequest, Account>();

            CreateMap<CreateRequest, Account>();

            CreateMap<UpdateRequest, Account>()
                .ForAllMembers(x => x.Condition(
                    (src, dest, prop) =>
                    {
                        // ignore null & empty string properties
                        if (prop == null)
                        {
                            return false;
                        }

                        if (prop.GetType() == typeof(string) && string.IsNullOrEmpty((string)prop))
                        {
                            return false;
                        }

                        // ignore null role
                        if (x.DestinationMember.Name == "Role" && src.Role == null)
                        {
                            return false;
                        }

                        return true;
                    }
                ));

            this.CreateMap<Category, CategoryDto>();
            this.CreateMap<CategoryDto, Category>();

            this.CreateMap<Article, ArticleDto>().
                ForMember(dest => dest.Author, o => o.MapFrom(src => src.ModifiedBy));
            this.CreateMap<ArticleDto, Article>().
                ForMember(dest => dest.ModifiedBy, o => o.MapFrom(src => src.Author));

            this.CreateMap<Comment, CommentDto>().
                ForMember(dest => dest.Author, o => o.MapFrom(src => src.ModifiedBy));
            this.CreateMap<CommentDto, Comment>().
                ForMember(dest => dest.ModifiedBy, o => o.MapFrom(src => src.Author));

            this.CreateMap<Author, AuthorDTO>();
            this.CreateMap<AuthorDTO, Author>();

            this.CreateMap<Book, BookDTO>();
            this.CreateMap<BookDTO, Book>();

        }
    }
}
