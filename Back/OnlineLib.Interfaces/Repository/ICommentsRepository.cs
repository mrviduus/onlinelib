using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Repository
{
    public interface ICommentsRepository : IGenericRepository<Comment, Guid>
    {
        public void DeleteComments(List<Guid> commentsToBeDeleted);
    }
}
