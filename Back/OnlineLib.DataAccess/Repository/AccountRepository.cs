using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class AccountRepository : GenericRepository<Account, Guid>, IAccountRepository
    {
        public AccountRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }

        public bool IsFirstAccount()
        {
            return this.context.Accounts.Count() == 0;
        }
    }
}
