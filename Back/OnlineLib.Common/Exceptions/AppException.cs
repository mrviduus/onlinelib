using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace OnlineLib.Common.Exceptions
{
    public class AppException : Exception
    {
        public AppException() : base() { }

        public AppException(string message) : base(message) { }

        public AppException(string message, params object [] args)
            :base(String.Format(CultureInfo.CurrentCulture, message, args))
        {
        }
    }
}
