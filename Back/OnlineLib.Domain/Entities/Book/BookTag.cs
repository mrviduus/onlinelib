using OnlineLib.Models.Entities;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Domain.Entities.Book
{
    public class BookTag : AssociationBase<Book, Tag>
    {
    }
}
