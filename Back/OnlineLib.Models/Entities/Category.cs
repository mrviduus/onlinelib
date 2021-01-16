using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using System.Text;

namespace OnlineLib.Models.Models
{
    public class Category : EntityBase
    {
        /// <summary>
        /// The category icon file
        /// </summary>
        public string Icon { get; set; }

        /// <summary>
        /// The name of the category
        /// </summary>
        [Required(ErrorMessageResourceName = "NameIsRequired")]
        [MaxLength(450)]
        public string Name { get; set; }

        public string Description { get; set; }

        public Guid? ParentId { get; set; }

        public virtual Category Parent { get; set; }

        /// <summary>
        /// Sub categories of the current category.
        /// </summary>
        //[ForeignKey("ParentId")]
        public virtual List<Category> Children { get; set; }
    }
}
