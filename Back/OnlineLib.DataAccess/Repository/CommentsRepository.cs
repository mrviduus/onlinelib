using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class CommentsRepository : GenericRepository<Comment, Guid>, ICommentsRepository
    {
        public CommentsRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }

        public void DeleteComments(List<Guid> commentsToBeDeleted)
        {
            var comments = this.context.Comment.ToList();
            List<Comment> result = comments.Where(x => commentsToBeDeleted.Contains(x.Id)).ToList();
            this.context.RemoveRange(result);
        }
    }
}
