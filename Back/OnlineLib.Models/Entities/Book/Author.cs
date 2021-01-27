using OnlineLib.Models.Entities;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class Author : EntityBase
    {
        public string FirstName { get; set; }

        public string LastName { get; set; }

        public string Biography { get; set; }

        public DateTime BirthDate { get; set; }

        [ForeignKey("AuthorId")]
        List<Book> Books { get; set; }

    }
}
