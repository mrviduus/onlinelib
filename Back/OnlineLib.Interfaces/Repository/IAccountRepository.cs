using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Entities;
using System;

namespace OnlineLib.Interfaces.Repository
{
    public interface IAccountRepository : IGenericRepository<Account, Guid>
    {
        public bool IsFirstAccount();

    }
}
