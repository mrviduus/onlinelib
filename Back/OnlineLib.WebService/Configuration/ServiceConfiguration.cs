using AspNetCoreRateLimit;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;
using OnlineLib.BusinessLogic.Managers;
using OnlineLib.DataAccess;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Models.Settings;
using System.Collections.Generic;

namespace OnlineLib.WebService.Configuration
{
    /// <summary>
    /// Provides methods for application services configuration.
    /// </summary>
    public class ServiceConfiguration
    {
        /// <summary>
        /// Configures application services.
        /// </summary>
        /// <param name="services">Application services collection.</param>
        /// <param name="configuration">Application configuration.</param>
        public static void ConfigureServices(IServiceCollection services, IConfiguration configuration)
        {
            string databaseConnectionString = configuration.GetDatabaseConnectionString();

            DataAccessServiceConfiguration.ConfigureServices(services, databaseConnectionString);

            // configure DI for application services
            services.AddScoped<IAccountManager, AccountManager>();
            services.AddScoped<IEmailManager, EmailManager>();
            services.AddScoped<IAdminManager, AdminManager>();

            // inject counter and rules stores
            services.AddSingleton<IIpPolicyStore, MemoryCacheIpPolicyStore>();
            services.AddSingleton<IRateLimitCounterStore, MemoryCacheRateLimitCounterStore>();

            services.AddSingleton<IHttpContextAccessor, HttpContextAccessor>();

            // configuration (resolvers, counter key builders)
            services.AddSingleton<IRateLimitConfiguration, RateLimitConfiguration>();

            services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new OpenApiInfo { Title = "OnlineLib", Version = "v1" });

                // Swagger 2.+ support
                var security = new Dictionary<string, IEnumerable<string>>
                {
                    {"Bearer", new string[] { }},
                };

                c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
                {
                    Description = "JWT Authorization, Bearer scheme. Example: \"Authorization: Bearer {token}\"",
                    Name = "Authorization",
                    In = ParameterLocation.Header,
                    Type = SecuritySchemeType.ApiKey,
                });
                c.AddSecurityRequirement(new OpenApiSecurityRequirement()
                {
                    {
                        new OpenApiSecurityScheme
                        {
                            Reference = new OpenApiReference
                            {
                                Type = ReferenceType.SecurityScheme,
                                Id = "Bearer",
                            },
                            Scheme = "oauth2",
                            Name = "Bearer",
                            In = ParameterLocation.Header,
                        },
                        new List<string>()
                    },
                });
            });
        }



    }
}
