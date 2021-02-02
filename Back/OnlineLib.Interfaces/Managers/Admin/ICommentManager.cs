using OnlineLib.Models.Dto;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface ICommentManager : IAdminManagerRepository<CommentDTO, Guid>
    {
        Task DeleteComments(List<Guid> ids);
    }
}
