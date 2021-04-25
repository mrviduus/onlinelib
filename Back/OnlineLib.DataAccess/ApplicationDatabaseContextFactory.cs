using Microsoft.EntityFrameworkCore;

namespace OnlineLib.DataAccess
{
    public class ApplicationDatabaseContextFactory
    {
        public static ApplicationDatabaseContext CreateContext(string connectionString)
        {
            DbContextOptions<ApplicationDatabaseContext> options = GetDbContextOptions(connectionString);
            return new ApplicationDatabaseContext(options);
        }

        private static DbContextOptions<ApplicationDatabaseContext> GetDbContextOptions(string connectionString)
        {
            var dbContextOptionsBuilder = new DbContextOptionsBuilder<ApplicationDatabaseContext>();
            dbContextOptionsBuilder.UseMySQL(connectionString, b => b.MigrationsAssembly("OnlineLib.WebService"));
            return dbContextOptionsBuilder.Options;
        }
    }
}
