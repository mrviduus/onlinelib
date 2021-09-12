using System;
using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Entities;

namespace OnlineLib.Interfaces.Repository
{
    public interface IAccountRepository : IGenericRepository<Account, Guid>
    {
        public bool IsFirstAccount();
    }
}
