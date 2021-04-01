using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AutoMapper;
using OnlineLib.Models.Models.Settings;
using OnlineLib.Interfaces.Managers;
using OnlineLib.BusinessLogic.Managers;
using OnlineLib.WebService.Middleware;
using OnlineLib.DataAccess;
using OnlineLib.WebService.Configuration;
using System.IO;
using AspNetCoreRateLimit;
using Microsoft.AspNetCore.Http;

namespace OnlineLib.WebService
{
    public class Startup
    {
        public static IConfiguration StaticConfig { get; private set; }

        public Startup(IConfiguration configuration)
        {
            this.Configuration = configuration;
            StaticConfig = configuration;

            string connectionString = this.Configuration.GetDatabaseConnectionString();
            DatabaseInitializer.InitializeDatabase(connectionString);
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            // needed to store rate limit counters and ip rules
            services.AddMemoryCache();

            services.AddAutoMapper(typeof(Startup));

            // configure strongly typed settings object
            services.Configure<AppSettings>(this.Configuration.GetSection("AppSettings"));

            // load general configuration from appsettings.json
            services.Configure<IpRateLimitOptions>(this.Configuration.GetSection("IpRateLimiting"));

            ServiceConfiguration.ConfigureServices(services, this.Configuration);

            services.AddCors();
            services.AddControllers().AddJsonOptions(x => x.JsonSerializerOptions.IgnoreNullValues = true);
            services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env, ILoggerFactory loggerFactory)
        {
            app.UseIpRateLimiting();
            //add log file
            var path = Directory.GetCurrentDirectory();
            loggerFactory.AddFile($"{path}\\Logs\\Log.txt");

            // generated swagger json and swagger ui middleware
            app.UseSwagger();
            app.UseSwaggerUI(x => x.SwaggerEndpoint("/swagger/v1/swagger.json", "ASP.NET Core OnlineLib"));

            app.UseRouting();
            app.UseStaticFiles();

            // global cors policy
            app.UseCors(x => x
                .SetIsOriginAllowed(origin => true)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials());

            // global error handler
            app.UseMiddleware<ErrorHandlerMiddleware>();

            // custom jwt auth middleware
            app.UseMiddleware<JwtMiddleware>();


            app.UseEndpoints(x => x.MapControllers());
        }
    }
}
