window.HANDBOOK_DATA = [
  {
    "id": 1,
    "title": "数组去重（uniqueArray）",
    "category": "数组",
    "status": "已通过",
    "difficulty": "简单",
    "summary": "使用 Set 利用唯一值特性完成数组去重。",
    "code": "const uniqueArray = arr => [...new Set(arr)]",
    "complexity": "时间 O(n)，空间 O(n)",
    "mistakes": [
      "需要根据题意确认是否保留首次出现顺序。"
    ],
    "questions": [
      "Set 为什么能保持当前实现的元素顺序？",
      "不用 Set 还能如何实现？"
    ]
  },
  {
    "id": 2,
    "title": "throttle（节流）",
    "category": "函数工具",
    "status": "已通过",
    "difficulty": "简单",
    "summary": "在固定时间窗口内最多执行一次，适合 scroll、mousemove 等高频事件。",
    "code": "function throttle(fn, delay) {\n  let timer = null\n\n  return function (...args) {\n    if (timer) return\n\n    timer = setTimeout(() => {\n      fn.apply(this, args)\n      timer = null\n    }, delay)\n  }\n}",
    "complexity": "单次调用时间 O(1)，额外空间 O(1)",
    "mistakes": [
      "定时器版需要在回调执行后将 timer 重置。"
    ],
    "questions": [
      "时间戳版与定时器版有什么区别？",
      "如何支持 leading 和 trailing 配置？"
    ]
  },
  {
    "id": 3,
    "title": "debounce（防抖）",
    "category": "函数工具",
    "status": "修正后通过",
    "difficulty": "简单",
    "summary": "连续触发时不断重置定时器，只在最后一次触发后的延迟时间到达时执行。",
    "code": "function debounce(fn, delay) {\n  let timer\n\n  return function (...args) {\n    clearTimeout(timer)\n\n    timer = setTimeout(() => {\n      fn.apply(this, args)\n    }, delay)\n  }\n}",
    "complexity": "单次调用时间 O(1)，额外空间 O(1)",
    "mistakes": [
      "返回箭头函数会捕获定义处 this，无法取得调用对象。"
    ],
    "questions": [
      "为什么这里必须返回普通函数？",
      "如何增加立即执行和 cancel 功能？"
    ]
  },
  {
    "id": 4,
    "title": "curry（函数柯里化）",
    "category": "函数工具",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "利用闭包持续收集参数，参数数量满足原函数形参数量后执行。",
    "code": "function curry(fn) {\n  return function curried(...args) {\n    if (args.length >= fn.length) {\n      return fn.apply(this, args)\n    }\n\n    return function (...rest) {\n      return curried.apply(this, [...args, ...rest])\n    }\n  }\n}",
    "complexity": "参数收集总时间 O(n)，空间 O(n)",
    "mistakes": [
      "需要注意递归返回函数时的 this 传递。"
    ],
    "questions": [
      "fn.length 表示什么？",
      "可选参数和剩余参数会带来什么问题？"
    ]
  },
  {
    "id": 5,
    "title": "deepClone（基础版）",
    "category": "对象",
    "status": "已通过，建议升级",
    "difficulty": "中等",
    "summary": "递归复制普通对象和数组；当前基础版未覆盖循环引用及特殊对象。",
    "code": "function deepClone(value) {\n  if (value === null || typeof value !== 'object') {\n    return value\n  }\n\n  const result = Array.isArray(value) ? [] : {}\n\n  Reflect.ownKeys(value).forEach(key => {\n    result[key] = deepClone(value[key])\n  })\n\n  return result\n}",
    "complexity": "时间 O(n)，空间 O(n)，n 为节点总数",
    "mistakes": [
      "基础版不支持循环引用、Date、RegExp、Map、Set。"
    ],
    "questions": [
      "如何用 WeakMap 解决循环引用？",
      "属性描述符和原型链如何保留？"
    ]
  },
  {
    "id": 6,
    "title": "EventEmitter",
    "category": "设计模式",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "实现 on、emit、off，使用 Map 保存事件名与处理函数列表。",
    "code": "class EventEmitter {\n  constructor() {\n    this.events = new Map()\n  }\n\n  on(type, fn) {\n    const handlers = this.events.get(type) || []\n    handlers.push(fn)\n    this.events.set(type, handlers)\n    return this\n  }\n\n  emit(type, ...args) {\n    const handlers = this.events.get(type) || []\n    ;[...handlers].forEach(fn => fn(...args))\n    return this\n  }\n\n  off(type, fn) {\n    const handlers = this.events.get(type)\n    if (!handlers) return this\n\n    this.events.set(\n      type,\n      handlers.filter(handler => handler !== fn)\n    )\n    return this\n  }\n}",
    "complexity": "on O(1)，emit O(n)，off O(n)",
    "mistakes": [
      "emit 时复制数组可避免回调过程中增删监听器影响当前遍历。"
    ],
    "questions": [
      "如何实现 once？",
      "off 不传 fn 时是否清空该事件？"
    ]
  },
  {
    "id": 7,
    "title": "Promise.all",
    "category": "Promise",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "保持输入顺序；全部成功后 resolve；任一失败立即 reject。",
    "code": "function promiseAll(iterable) {\n  return new Promise((resolve, reject) => {\n    const promises = Array.from(iterable)\n\n    if (promises.length === 0) {\n      resolve([])\n      return\n    }\n\n    const result = []\n    let fulfilledCount = 0\n\n    promises.forEach((item, index) => {\n      Promise.resolve(item).then(value => {\n        result[index] = value\n        fulfilledCount++\n\n        if (fulfilledCount === promises.length) {\n          resolve(result)\n        }\n      }, reject)\n    })\n  })\n}",
    "complexity": "时间 O(n)，空间 O(n)",
    "mistakes": [
      "结果必须按输入顺序保存，而不是完成顺序。"
    ],
    "questions": [
      "为什么需要 Promise.resolve？",
      "Promise.all([]) 的结果是什么？"
    ]
  },
  {
    "id": 8,
    "title": "Promise.race",
    "category": "Promise",
    "status": "修正后通过",
    "difficulty": "简单",
    "summary": "第一个 settled 的成员决定最终 Promise 的状态和值。",
    "code": "function promiseRace(iterable) {\n  return new Promise((resolve, reject) => {\n    for (const item of iterable) {\n      Promise.resolve(item).then(resolve, reject)\n    }\n  })\n}",
    "complexity": "遍历时间 O(n)，额外空间 O(1)",
    "mistakes": [
      "Promise.race([]) 会永久保持 pending，而不是 resolve([])。"
    ],
    "questions": [
      "race 与 any 的核心区别是什么？",
      "为什么不需要完成计数？"
    ]
  },
  {
    "id": 9,
    "title": "Promise.allSettled",
    "category": "Promise",
    "status": "修正后通过",
    "difficulty": "中等",
    "summary": "等待所有成员 settled，并按输入顺序返回每个成员的状态和结果。",
    "code": "function promiseAllSettled(iterable) {\n  return new Promise(resolve => {\n    const promises = Array.from(iterable)\n\n    if (promises.length === 0) {\n      resolve([])\n      return\n    }\n\n    const result = []\n    let settledCount = 0\n\n    const checkDone = () => {\n      settledCount++\n      if (settledCount === promises.length) {\n        resolve(result)\n      }\n    }\n\n    promises.forEach((item, index) => {\n      Promise.resolve(item).then(\n        value => {\n          result[index] = { status: 'fulfilled', value }\n          checkDone()\n        },\n        reason => {\n          result[index] = { status: 'rejected', reason }\n          checkDone()\n        }\n      )\n    })\n  })\n}",
    "complexity": "时间 O(n)，空间 O(n)",
    "mistakes": [
      "曾遗漏空 iterable；allSettled([]) 应 resolve([])。"
    ],
    "questions": [
      "为什么不能遇到 reject 就提前结束？",
      "与 Promise.all 的使用场景有何不同？"
    ]
  },
  {
    "id": 10,
    "title": "Promise.any",
    "category": "Promise",
    "status": "修正后通过",
    "difficulty": "中等",
    "summary": "第一个 fulfilled 的成员决定结果；只有全部 rejected 才以 AggregateError 失败。",
    "code": "function promiseAny(iterable) {\n  return new Promise((resolve, reject) => {\n    const promises = Array.from(iterable)\n\n    if (promises.length === 0) {\n      reject(new AggregateError([], 'All promises were rejected'))\n      return\n    }\n\n    const errors = []\n    let rejectedCount = 0\n\n    promises.forEach((item, index) => {\n      Promise.resolve(item).then(resolve, reason => {\n        errors[index] = reason\n        rejectedCount++\n\n        if (rejectedCount === promises.length) {\n          reject(\n            new AggregateError(errors, 'All promises were rejected')\n          )\n        }\n      })\n    })\n  })\n}",
    "complexity": "时间 O(n)，空间 O(n)",
    "mistakes": [
      "AggregateError 的第一个参数应是失败原因列表；any([]) 立即 reject。"
    ],
    "questions": [
      "为什么 errors 要按输入索引保存？",
      "Promise.any 与 Promise.race 如何选择？"
    ]
  },
  {
    "id": 11,
    "title": "mySetInterval",
    "category": "定时器",
    "status": "二次提交通过",
    "difficulty": "中等",
    "summary": "通过递归 setTimeout 在每次执行后调度下一次任务，并提供 cancel。",
    "code": "function mySetInterval(fn, delay) {\n  let timer\n  let cancelled = false\n\n  function run() {\n    if (cancelled) return\n\n    timer = setTimeout(() => {\n      fn()\n      run()\n    }, delay)\n  }\n\n  run()\n\n  return {\n    cancel() {\n      cancelled = true\n      clearTimeout(timer)\n    }\n  }\n}",
    "complexity": "每轮调度时间和额外空间 O(1)",
    "mistakes": [
      "while (true) 会阻塞事件循环并无限注册定时器。"
    ],
    "questions": [
      "递归 setTimeout 与 setInterval 有什么差别？",
      "如何补偿定时漂移？"
    ]
  },
  {
    "id": 12,
    "title": "LRU Cache",
    "category": "数据结构",
    "status": "一次通过",
    "difficulty": "中等",
    "summary": "使用 Map 的插入顺序维护最近使用关系；访问后删除并重新插入。",
    "code": "class LRUCache {\n  constructor(capacity) {\n    this.cap = capacity\n    this.cache = new Map()\n  }\n\n  get(key) {\n    if (!this.cache.has(key)) return -1\n\n    const value = this.cache.get(key)\n    this.cache.delete(key)\n    this.cache.set(key, value)\n    return value\n  }\n\n  put(key, value) {\n    if (this.cache.has(key)) {\n      this.cache.delete(key)\n    } else if (this.cache.size >= this.cap) {\n      const oldestKey = this.cache.keys().next().value\n      this.cache.delete(oldestKey)\n    }\n\n    this.cache.set(key, value)\n  }\n}",
    "complexity": "平均 get O(1)，put O(1)，空间 O(capacity)",
    "mistakes": [
      "生产级实现需明确 capacity <= 0 的行为。"
    ],
    "questions": [
      "不用 Map 如何用哈希表和双向链表实现？",
      "为什么普通数组无法满足 O(1)？"
    ]
  },
  {
    "id": 13,
    "title": "Event Loop 01：Promise.then vs setTimeout",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "同步代码先执行；then 是微任务；setTimeout 是后续宏任务。",
    "code": "console.log(1)\n\nsetTimeout(() => {\n  console.log(2)\n}, 0)\n\nPromise.resolve().then(() => {\n  console.log(3)\n})\n\nconsole.log(4)",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：1 → 4 → 3 → 2"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "1 → 4 → 3 → 2"
  },
  {
    "id": 14,
    "title": "Event Loop 02：宏任务中的微任务",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "每执行完一个宏任务，都要先清空其产生的全部微任务。",
    "code": "console.log(1)\n\nsetTimeout(() => {\n  console.log(2)\n\n  Promise.resolve().then(() => {\n    console.log(3)\n  })\n}, 0)\n\nsetTimeout(() => {\n  console.log(4)\n}, 0)",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：1 → 2 → 3 → 4"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "1 → 2 → 3 → 4"
  },
  {
    "id": 15,
    "title": "Event Loop 03：微任务嵌套",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "微任务执行中产生的新微任务追加到队尾，不会插队。",
    "code": "console.log(1)\n\nPromise.resolve().then(() => {\n  console.log(2)\n\n  Promise.resolve().then(() => {\n    console.log(3)\n  })\n})\n\nPromise.resolve().then(() => {\n  console.log(4)\n})\n\nconsole.log(5)",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：1 → 5 → 2 → 4 → 3"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "1 → 5 → 2 → 4 → 3"
  },
  {
    "id": 16,
    "title": "Event Loop 04：async / await",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "await 后续作为微任务恢复；本题中它比显式 then 更早入队。",
    "code": "async function async1() {\n  console.log('async1 start')\n  await async2()\n  console.log('async1 end')\n}\n\nasync function async2() {\n  console.log('async2')\n}\n\nconsole.log('script start')\nasync1()\n\nPromise.resolve().then(() => {\n  console.log('promise')\n})\n\nconsole.log('script end')",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：script start → async1 start → async2 → script end → async1 end → promise"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "script start → async1 start → async2 → script end → async1 end → promise"
  },
  {
    "id": 17,
    "title": "Event Loop 05：Promise executor",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "Promise executor 同步执行；then 回调进入微任务队列。",
    "code": "async function async1() {\n  console.log('async1 start')\n  await async2()\n  console.log('async1 end')\n}\n\nasync function async2() {\n  console.log('async2')\n}\n\nconsole.log('script start')\n\nsetTimeout(() => {\n  console.log('setTimeout')\n}, 0)\n\nasync1()\n\nnew Promise(resolve => {\n  console.log('promise1')\n  resolve()\n}).then(() => {\n  console.log('promise2')\n})\n\nconsole.log('script end')",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：script start → async1 start → async2 → promise1 → script end → async1 end → promise2 → setTimeout"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "script start → async1 start → async2 → promise1 → script end → async1 end → promise2 → setTimeout"
  },
  {
    "id": 18,
    "title": "Event Loop 06：微任务中注册宏任务",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "微任务中注册的 setTimeout 排在已注册宏任务之后。",
    "code": "console.log(1)\n\nsetTimeout(() => {\n  console.log(2)\n\n  Promise.resolve().then(() => {\n    console.log(3)\n  })\n}, 0)\n\nPromise.resolve().then(() => {\n  console.log(4)\n\n  setTimeout(() => {\n    console.log(5)\n  }, 0)\n})\n\nconsole.log(6)",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：1 → 6 → 4 → 2 → 3 → 5"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "1 → 6 → 4 → 2 → 3 → 5"
  },
  {
    "id": 19,
    "title": "Event Loop 07：综合题",
    "category": "Event Loop",
    "status": "已通过",
    "difficulty": "中等",
    "summary": "同步阶段建立微任务 B、G、H；按 FIFO 清空，再执行宏任务 E。",
    "code": "async function async1() {\n  console.log('A')\n  await async2()\n  console.log('B')\n}\n\nasync function async2() {\n  console.log('C')\n}\n\nconsole.log('D')\n\nsetTimeout(() => {\n  console.log('E')\n}, 0)\n\nasync1()\n\nnew Promise(resolve => {\n  console.log('F')\n  resolve()\n}).then(() => {\n  console.log('G')\n})\n\nPromise.resolve().then(() => {\n  console.log('H')\n})\n\nconsole.log('I')",
    "complexity": "考察执行顺序，不涉及传统算法复杂度",
    "mistakes": [
      "正确输出：D → A → C → F → I → B → G → H → E"
    ],
    "questions": [
      "请按同步任务、微任务、宏任务列出入队过程。"
    ],
    "answer": "D → A → C → F → I → B → G → H → E"
  }
];
