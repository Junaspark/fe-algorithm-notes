
const data = window.HANDBOOK_DATA
const list = document.querySelector('#exerciseList')
const input = document.querySelector('#searchInput')
const filters = document.querySelector('#filters')
const empty = document.querySelector('#emptyState')
const themeBtn = document.querySelector('#themeBtn')

const categories = ['全部', ...new Set(data.map(item => item.category))]
let activeCategory = '全部'

document.querySelector('#totalCount').textContent = data.length

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function renderFilters() {
  filters.innerHTML = categories.map(category => `
    <button class="filter-btn ${category === activeCategory ? 'active' : ''}" data-category="${category}">
      ${category}
    </button>
  `).join('')
}

function render() {
  const keyword = input.value.trim().toLowerCase()
  const filtered = data.filter(item => {
    const matchesCategory = activeCategory === '全部' || item.category === activeCategory
    const haystack = [
      item.title, item.category, item.summary, item.status,
      item.mistakes.join(' '), item.questions.join(' ')
    ].join(' ').toLowerCase()
    return matchesCategory && haystack.includes(keyword)
  })

  list.innerHTML = filtered.map(item => `
    <details class="exercise">
      <summary>
        <span class="number">${String(item.id).padStart(2,'0')}</span>
        <span class="exercise-title">
          <h3>${item.title}</h3>
          <span class="meta"><span>${item.category}</span><span>·</span><span>${item.status}</span><span>·</span><span>${item.difficulty}</span></span>
        </span>
        <span class="chevron">⌄</span>
      </summary>
      <div class="exercise-body">
        <p>${item.summary}</p>
        ${item.answer ? `<p class="answer">正确输出：${item.answer}</p>` : ''}
        <div class="code-wrap">
          <button class="copy-btn" type="button">复制代码</button>
          <pre><code>${escapeHtml(item.code)}</code></pre>
        </div>
        <div class="info-grid">
          <div class="info-box"><b>复杂度 / 重点</b><p>${item.complexity}</p></div>
          <div class="info-box"><b>易错点</b><ul>${item.mistakes.map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div class="info-box"><b>面试追问</b><ul>${item.questions.map(x => `<li>${x}</li>`).join('')}</ul></div>
        </div>
      </div>
    </details>
  `).join('')

  empty.hidden = filtered.length !== 0
}

filters.addEventListener('click', event => {
  const button = event.target.closest('[data-category]')
  if (!button) return
  activeCategory = button.dataset.category
  renderFilters()
  render()
})

input.addEventListener('input', render)

list.addEventListener('click', async event => {
  const button = event.target.closest('.copy-btn')
  if (!button) return
  const code = button.nextElementSibling.innerText
  await navigator.clipboard.writeText(code)
  const original = button.textContent
  button.textContent = '已复制'
  setTimeout(() => button.textContent = original, 1200)
})

themeBtn.addEventListener('click', () => {
  const html = document.documentElement
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark'
  html.dataset.theme = next
  localStorage.setItem('handbook-theme', next)
})

const savedTheme = localStorage.getItem('handbook-theme')
if (savedTheme) document.documentElement.dataset.theme = savedTheme

renderFilters()
render()
