using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Configuration
{
    /// <summary>
    /// Provides extension methods for <see cref="IConfiguration"/>.
    /// </summary>
    public static class ConfigurationExtensions
    {
        private const string DatabaseConnectionString = "DatabaseConnectionString";

        /// <summary>
        /// Gets database connection string.
        /// </summary>
        /// <param name="configuration">The configuration.</param>
        /// <returns>Database connection string.</returns>
        public static string GetDatabaseConnectionString(this IConfiguration configuration)
        {
            return configuration.GetConnectionString(DatabaseConnectionString);
        }
    }
}
