using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Common.Exceptions
{
    /// <summary>
    /// Defines an exception that occured when entity is not found.
    /// </summary>
    [Serializable]
    public class EntityNotFoundException : BusinessLogicException
    {
        private const string ErrorCodeValue = "EntityNotFound";

        /// <summary>
        /// Gets entity identifier.
        /// </summary>
        public string EntityType { get; }

        /// <summary>
        /// Gets entity type name.
        /// </summary>
        public object EntityId { get; }

        /// <summary>
        /// Gets additional exception properties.
        /// </summary>
        public override object Extension => new { this.EntityType, this.EntityId };

        public EntityNotFoundException(Type entityType)
            : this(entityType, null)
        {
        }

        public EntityNotFoundException(Type entityType, object entityId)
            : base(ErrorCodeValue, CreateMessage(entityType, entityId))
        {
            this.EntityId = entityId;
            this.EntityType = entityType.Name;
        }

        private static string CreateMessage(Type entityType, object entityId)
        {
            return entityId == null
                    ? $"{entityType} was not found."
                    : $"{entityType} with identifier {entityId} was not found.";
        }
    }
}
