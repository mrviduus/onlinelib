namespace OnlineLib.Interfaces.Common
{
    /// <summary>
    /// Unit of work factory interface.
    /// </summary>
    public interface IUnitOfWorkFactory
    {
        /// <summary>
        /// Creates instance of <see cref="IUnitOfWork"/>.
        /// </summary>
        /// <returns>The instance of <see cref="IUnitOfWork"/></returns>
        IUnitOfWork CreateUnitOfWork();
    }
}
