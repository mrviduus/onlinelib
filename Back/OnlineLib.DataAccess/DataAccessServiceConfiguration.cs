using Microsoft.Extensions.DependencyInjection;
using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess
{
    public class DataAccessServiceConfiguration
    {
        /// <summary>
        /// Configures data access settings.
        /// </summary>
        /// <param name="services">The collection of application services.</param>
        /// <param name="connectionString">The database connection string.</param>
        public static void ConfigureServices(IServiceCollection services, string connectionString)
        {
            services.AddSingleton<IUnitOfWorkFactory, UnitOfWorkFactory>(
                (provider) => new UnitOfWorkFactory(connectionString));

            services.AddScoped<IUnitOfWork, UnitOfWork>((provider) => {
                var context = ApplicationDatabaseContextFactory.CreateContext(connectionString);
                return new UnitOfWork(context);
            });
        }
    }
}
