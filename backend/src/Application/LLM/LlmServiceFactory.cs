using Domain.LLM;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Application.LLM;

/// <summary>
/// Resolves an <see cref="ILlmService"/> per job. Provider selection is
/// config-driven — <c>LLM:Providers:{JobName}</c> picks the key under
/// which the service was registered. Falls back to
/// <c>LLM:DefaultProvider</c>, then to <c>"openai"</c>.
/// </summary>
public class LlmServiceFactory : ILlmServiceFactory
{
    private readonly IServiceProvider _sp;
    private readonly IConfiguration _config;

    public LlmServiceFactory(IServiceProvider sp, IConfiguration config)
    {
        _sp = sp;
        _config = config;
    }

    public ILlmService Get(string jobName)
    {
        var key = _config[$"LLM:Providers:{jobName}"]
            ?? _config["LLM:DefaultProvider"]
            ?? "openai";

        return _sp.GetRequiredKeyedService<ILlmService>(key);
    }
}
