using OnlineLib.Domain.DTO.Book;
using OnlineLib.Domain.Entities.Book;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface IBookManager : IAdminManagerRepository<BookDTO, Guid>
    {
    }
}
