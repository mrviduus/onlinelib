using OnlineLib.Domain.DTO.Book;
using System;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface IAuthorManager : IAdminManagerRepository<AuthorDTO, Guid>
    {
    }
}
