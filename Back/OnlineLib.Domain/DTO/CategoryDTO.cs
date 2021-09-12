using System;

namespace OnlineLib.Models.Dto
{
    public class CategoryDTO
    {
        public Guid Id { get; set; }

        public string Icon { get; set; }

        public string Name { get; set; }

        public string Description { get; set; }

        public Guid? ParentId { get; set; }
    }
}