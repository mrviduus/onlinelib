using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Managers
{
    public interface IEmailManager
    {
        void Send(string to, string subject, string html, string from = null);
    }
}
