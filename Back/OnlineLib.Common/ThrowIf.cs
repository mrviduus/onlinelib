using OnlineLib.Common.Exceptions;
using System;

namespace OnlineLib.Common
{
    public static class ThrowIf
    {
        /// <summary>
        /// Throws <see cref="EntityNotFoundException"/> if specified entity is null.
        /// </summary>
        /// <typeparam name="T">Type of the entity.</typeparam>
        /// <typeparam name="K">Type of the entity key.</typeparam>
        /// <param name="entity">The entity to check.</param>
        /// <param name="key">The entity key.</param>
        public static void NotFound<T, K>(T entity, K key)
        {
            if (entity == null)
            {
                throw new EntityNotFoundException(typeof(T), key);
            }
        }

        /// <summary>
        /// Throws <see cref="EntityNotFoundException"/> if entity is null.
        /// </summary>
        /// <typeparam name="T">Type of the entity.</typeparam>
        /// <param name="entity">The entity to check.</param>
        public static void NotFound<T>(T entity)
        {
            if (entity == null)
            {
                throw new EntityNotFoundException(typeof(T));
            }
        }

        /// <summary>
        /// Throws <see cref="ArgumentNullException"/> if specified argument is null.
        /// </summary>
        /// <param name="argument">The argument to check.</param>
        /// <param name="argumentName">The argument name.</param>
        public static void Null(object argument, string argumentName)
        {
            if (argument == null)
            {
                throw new ArgumentNullException(argumentName);
            }
        }
    }
}
