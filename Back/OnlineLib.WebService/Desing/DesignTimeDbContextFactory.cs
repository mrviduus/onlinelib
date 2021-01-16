using Microsoft.EntityFrameworkCore.Design;

namespace OnlineLib.DataAccess.Desing
{
    class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ApplicationDatabaseContext>
    {
        public ApplicationDatabaseContext CreateDbContext(string[] args)
        {
            return ApplicationDatabaseContextFactory.CreateContext("Server=localhost;Port=3306;Database=devlib;Uid=root;Pwd=root;");
        }
    }
}
