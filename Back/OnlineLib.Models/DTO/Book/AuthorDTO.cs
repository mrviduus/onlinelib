﻿using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.DTO.Book
{
    public class AuthorDTO
    {
        public string FirstName { get; set; }

        public string LastName { get; set; }

        public string Biography { get; set; }

        public DateTime BirthDate { get; set; }
    }
}
