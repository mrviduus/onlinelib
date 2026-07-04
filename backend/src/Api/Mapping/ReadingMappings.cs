using System.Linq.Expressions;
using Api.Endpoints;
using Domain.Entities;

namespace Api.Mapping;

// R4: single source of truth for ReadingGoal -> GoalDto. Used both as an EF projection
// (.Select(ReadingMappings.Project)) and in-memory (goal.ToDto()).
public static class ReadingMappings
{
    public static readonly Expression<Func<ReadingGoal, GoalDto>> Project = g => new GoalDto(
        g.Id, g.GoalType, g.TargetValue, g.Year, g.StreakMinMinutes, g.UpdatedAt);

    private static readonly Func<ReadingGoal, GoalDto> _compiled = Project.Compile();

    public static GoalDto ToDto(this ReadingGoal g) => _compiled(g);
}
