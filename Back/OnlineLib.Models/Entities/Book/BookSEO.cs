﻿using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class BookSEO : EntityBase
    {
        public Guid BookId { get; set; }

        [ForeignKey("BookId")]
        public virtual Book Book { get; set; }

        public string PageName { get; set; }

        public string Title { get; set; }

        public string Description { get; set; }

        public string Image { get; set; }

        public string Video { get; set; }

        public string Locale { get; set; }

        public string Keywords { get; set; }
    }
}
