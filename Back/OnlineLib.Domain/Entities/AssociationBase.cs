using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Models.Entities
{
    public class AssociationBase<TSource, TTarget>
    {
        public Guid Id { get; set; }

        public string Relation { get; set; }

        public Guid SourceId { get; set; }

        public TSource Source { get; set; }

        public Guid TargetId { get; set; }

        public TTarget Target { get; set; }
    }
}
