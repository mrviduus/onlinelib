using OnlineLib.Models.Dto;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface ICommentManager : IAdminManagerRepository<CommentDTO, Guid>
    {
        Task DeleteComments(List<Guid> ids);
    }
}
