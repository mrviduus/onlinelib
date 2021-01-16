using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;

namespace OnlineLib.Interfaces.Common
{
    /// <summary>
    /// Generic repository interface.
    /// </summary>
    /// <typeparam name="TEntity">Type of repository entity.</typeparam>
    /// <typeparam name="TKey">Type of key field of entity.</typeparam>
    public interface IGenericRepository<TEntity, TKey>
        where TEntity : class
    {
        /// <summary>
        /// Deletes the entity with specified identifier.
        /// </summary>
        /// <param name="id">The entity identifier.</param>
        void Delete(TKey id);

        /// <summary>
        /// Deletes specified entity.
        /// </summary>
        /// <param name="entityToDelete">The entity to delete.</param>
        void Delete(TEntity entityToDelete);

        /// <summary>
        /// Gets collection of entity satisfying the filter condition.
        /// </summary>
        /// <param name="filter">The filter condition.</param>
        /// <param name="orderBy">The order expression.</param>
        /// <returns></returns>
        IEnumerable<TEntity> Get(Expression<Func<TEntity, bool>> filter = null, Func<IQueryable<TEntity>, IOrderedQueryable<TEntity>> order = null);

        /// <summary>
        /// Gets entity by identifier.
        /// </summary>
        /// <param name="id">The entity identifier.</param>
        /// <returns></returns>
        TEntity GetByID(TKey id);

        /// <summary>
        /// Inserts new entity.
        /// </summary>
        /// <param name="entity">The entity to insert.</param>
        void Insert(TEntity entity);

        /// <summary>
        /// Updates existing entity.
        /// </summary>
        /// <param name="entityToUpdate">The entity to update.</param>
        void Update(TEntity entityToUpdate);

        /// <summary>
        /// Check and create or update
        /// </summary>
        /// <param name="entity"> entity </param>
        void InsertOrUpdate(TEntity entity);
    }
}
