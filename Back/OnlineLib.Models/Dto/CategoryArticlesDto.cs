using System;

namespace OnlineLib.Models.Dto
{
    public class CategoryArticlesDto
    {
        public Guid CategoryId { get; set; }

        public string CategoryName { get; set; }

        public int Count { get; set; }
    }
}