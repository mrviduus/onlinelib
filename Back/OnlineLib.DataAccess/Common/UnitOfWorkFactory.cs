using OnlineLib.Interfaces.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Common
{
    public class UnitOfWorkFactory : IUnitOfWorkFactory
    {
        private string ConnectionString;

        public UnitOfWorkFactory(string connectionString)
        {
            this.ConnectionString = connectionString;
        }

        public IUnitOfWork CreateUnitOfWork()
        {
            var context = ApplicationDatabaseContextFactory.CreateContext(this.ConnectionString);
            return new UnitOfWork(context);
        }
    }
}
