FROM mcr.microsoft.com/dotnet/sdk:5.0 AS build-env
WORKDIR /app
COPY . ./

RUN dotnet restore OnlineLib.sln
RUN dotnet publish OnlineLib.sln -c release -o obj/Docker/publish --no-restore


FROM mcr.microsoft.com/dotnet/aspnet:5.0
WORKDIR /app
EXPOSE 80
COPY --from=build-env /app/obj/Docker/publish .

ENTRYPOINT ["dotnet", "OnlineLib.WebService.dll"]
