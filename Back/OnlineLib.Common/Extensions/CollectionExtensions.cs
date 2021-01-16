using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace OnlineLib.Common.Extensions
{
    /// <summary>
    /// Contains extension methods for collections.
    /// </summary>
    public static class CollectionExtensions
    {
        /// <summary>
        /// Adds the elements of the specified collection to the end of the <c>ICollection<T></c>.
        /// </summary>
        /// <typeparam name="T">Type of the collection elements.</typeparam>
        /// <param name="collection">Collection that should be modified.</param>
        /// <param name="range">The collection whose elements should be added to the end of the <c>ICollection<T></c>.</param>
        public static void AddRange<T>(this ICollection<T> collection, IEnumerable<T> range)
        {
            foreach (var item in range)
            {
                collection.Add(item);
            }
        }

        public static bool IsNotNullOrEmpty<T>(this System.Collections.Generic.IEnumerable<T> source)
        {
            return source != null && source.Any();
        }
    }
}
