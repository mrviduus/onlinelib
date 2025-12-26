import './AuthorList.css'

export interface AuthorItem {
  id: string
  name: string
  role: string
}

const ROLES = ['Author', 'Translator', 'Editor', 'Illustrator']

interface AuthorListProps {
  authors: AuthorItem[]
  onChange: (authors: AuthorItem[]) => void
}

export function AuthorList({ authors, onChange }: AuthorListProps) {
  const moveUp = (index: number) => {
    if (index === 0) return
    const newAuthors = [...authors]
    ;[newAuthors[index - 1], newAuthors[index]] = [newAuthors[index], newAuthors[index - 1]]
    onChange(newAuthors)
  }

  const moveDown = (index: number) => {
    if (index === authors.length - 1) return
    const newAuthors = [...authors]
    ;[newAuthors[index], newAuthors[index + 1]] = [newAuthors[index + 1], newAuthors[index]]
    onChange(newAuthors)
  }

  const remove = (index: number) => {
    onChange(authors.filter((_, i) => i !== index))
  }

  const changeRole = (index: number, role: string) => {
    const newAuthors = [...authors]
    newAuthors[index] = { ...newAuthors[index], role }
    onChange(newAuthors)
  }

  if (authors.length === 0) {
    return (
      <div className="author-list author-list--empty">
        <p>No authors selected</p>
      </div>
    )
  }

  return (
    <ul className="author-list">
      {authors.map((author, index) => (
        <li key={author.id} className="author-list__item">
          <span className="author-list__order">{index + 1}</span>

          <span className="author-list__name">{author.name}</span>

          <select
            className="author-list__role"
            value={author.role}
            onChange={(e) => changeRole(index, e.target.value)}
          >
            {ROLES.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>

          <div className="author-list__actions">
            <button
              type="button"
              className="author-list__btn"
              onClick={() => moveUp(index)}
              disabled={index === 0}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="author-list__btn"
              onClick={() => moveDown(index)}
              disabled={index === authors.length - 1}
              title="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="author-list__btn author-list__btn--remove"
              onClick={() => remove(index)}
              title="Remove"
            >
              ×
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
