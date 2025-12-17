var builder = Host.CreateApplicationBuilder(args);

// TODO: Add ingestion background service

var host = builder.Build();
host.Run();
