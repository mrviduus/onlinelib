using OnlineLib.Interfaces.Exceptions;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Common.Exceptions
{
    /// <summary>
    /// Defines an exception related to application business logic.
    /// </summary>
    [Serializable]
    public class BusinessLogicException : Exception, IException
    {
        /// <summary>
        /// Gets code of error type.
        /// </summary>
        public virtual string ErrorCode { get; }

        /// <summary>
        /// Gets additional exception properties.
        /// </summary>
        public virtual object Extension { get; }

        public BusinessLogicException() { }

        public BusinessLogicException(string errorCode) : this(errorCode, null) { }

        public BusinessLogicException(string errorCode, string message) : this(errorCode, message, null) { }

        public BusinessLogicException(string errorCode, string message, Exception inner) : base(message, inner)
        {
            this.ErrorCode = errorCode;
        }

        protected BusinessLogicException(
          string errorCode,
          System.Runtime.Serialization.SerializationInfo info,
          System.Runtime.Serialization.StreamingContext context) : base(info, context)
        {
            this.ErrorCode = errorCode;
        }
    }
}
