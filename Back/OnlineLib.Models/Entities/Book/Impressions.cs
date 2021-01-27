using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class Impressions : EntityBase
    {
        public Guid BookId { get; set; }

        public string Content { get; set; }

        public virtual List<Impressions> Replies { get; set; }

        public Guid? ReplyTo { get; set; }

        public string CreatedBy { get; set; }

        public DateTime CreationTime { get; set; }

        public DateTime LastModifiedTime { get; set; }

        public string ModifiedBy { get; set; }
    }
}
