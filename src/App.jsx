import { useEffect, useMemo, useState } from "react";

// タスクの日付をざっくりと推測してくれる関数群
function formatDate(date) {
  const y = date.getFullYear();
  // padStart(2, "0") は、1桁のとき（例: "3"）に前に "0" をつけて "03" にする処理
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 全角数字や全角スペースを半角に変換して、前後の空白を削除
function normalizeText(text) {
  return text
    .replace(/[０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    )
    .replace(/／/g, "/")
    .replace(/　/g, " ")
    .trim();
}

// 月と日から、今年か来年のどちらの可能性が高いかを判断して日付文字列を作る
function makeDateFromMonthDay(month, day) {
  // 今日の日付を取得
  const now = new Date();
  // 今年の年を取得
  let year = now.getFullYear();

  // 比較用に今日の日付を年・月・日のみの形式で作る
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // monthとdayを比較する用の日付を作る（年は今年のまま）
  const candidate = new Date(year, month - 1, day);

  // もし候補の日付が今日より前なら、年を来年にする
  if (candidate < today) {
    year += 1;
  }

  // 最終的に年・月・日が揃った日付を文字列にして返す
  return formatDate(new Date(year, month - 1, day));
}

// 入力テキストから日にちを推測する関数
function parseLooseDate(text) {
  const now = new Date();
  const input = normalizeText(text);

  // 今日を表すキーワードのリスト
  const todayKeywords = [
    "今日",
    "今日中",
    "今すぐ",
    "すぐ",
    "このあと",
    "あとで",
    "授業前",
    "放課後",
  ];

  // 入力に今日を表すキーワードが含まれているかをチェック
  if (todayKeywords.some((keyword) => input.includes(keyword))) {
    return formatDate(now);
  }

  if (/\d限/.test(input)) {
    return formatDate(now);
  }
  
  // 明日が含まれているかどうか判定
  if (input.includes("明日")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  //以下、形式を正規表現で判定して、月と日を抽出
  // 4/2, 04/02, ４／２
  const slashMatch = input.match(/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    return makeDateFromMonthDay(month, day);
  }

  // 4月2日, ４月２日
  const japaneseDateMatch = input.match(/(\d{1,2})月(\d{1,2})日/);
  if (japaneseDateMatch) {
    const month = Number(japaneseDateMatch[1]);
    const day = Number(japaneseDateMatch[2]);
    return makeDateFromMonthDay(month, day);
  }

  return null;
}

// タスクの日付を「今日」「明日」「未設定」などの相対的な表現に変換する関数
function getRelativeLabel(date) {
  if (!date) return "未設定";

  const today = formatDate(new Date());

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  if (date === today) return "今日";
  if (date === tomorrow) return "明日";

  return date;
}

// タスクの配列を日付順にソートする関数 
function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (!a.date && !b.date) return b.createdAt - a.createdAt;
    if (!a.date) return 1;
    if (!b.date) return -1;

    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;

    return b.createdAt - a.createdAt;
  });
}

// タスクを「今日」「明日」「未設定」などのグループに分ける関数
function groupTasks(tasks) {
  const sorted = sortTasks(tasks);

  const today = formatDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  const grouped = {
    今日: [],
    明日: [],
    未設定: [],
  };

  for (const task of sorted) {
    if (!task.date) {
      grouped["未設定"].push(task);
    } else if (task.date === today) {
      grouped["今日"].push(task);
    } else if (task.date === tomorrow) {
      grouped["明日"].push(task);
    } else {
      if (!grouped[task.date]) {
        grouped[task.date] = [];
      }
      grouped[task.date].push(task);
    }
  }

  const orderedGroups = [];

  if (grouped["今日"].length > 0) {
    orderedGroups.push(["今日", grouped["今日"]]);
  }

  if (grouped["明日"].length > 0) {
    orderedGroups.push(["明日", grouped["明日"]]);
  }

  const datedKeys = Object.keys(grouped)
    .filter((key) => !["今日", "明日", "未設定"].includes(key))
    .sort((a, b) => a.localeCompare(b));

  for (const key of datedKeys) {
    orderedGroups.push([key, grouped[key]]);
  }

  if (grouped["未設定"].length > 0) {
    orderedGroups.push(["未設定", grouped["未設定"]]);
  }

  return orderedGroups;
}

// タスクアイテムのコンポーネント
function TaskItem({ task, onToggle, onDelete }) {
  return (
    <div style={styles.item}>
      <button
        onClick={() => onToggle(task.id)}
        style={{
          ...styles.check,
          opacity: task.done ? 0.5 : 1,
        }}
      >
        {task.done ? "✓" : "○"}
      </button>

      <div style={styles.taskBody}>
        <div
          style={{
            ...styles.taskText,
            textDecoration: task.done ? "line-through" : "none",
            opacity: task.done ? 0.5 : 1,
          }}
        >
          {task.text}
        </div>
        <div style={styles.taskMeta}>{getRelativeLabel(task.date)}</div>
      </div>

      <button onClick={() => onDelete(task.id)} style={styles.delete}>
        削除
      </button>
    </div>
  );
}

// タスクのグループセクションのコンポーネント
function TaskSection({ title, tasks, onToggle, onDelete }) {
  if (tasks.length === 0) return null;

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>
        {title}
        <span style={styles.sectionCount}>{tasks.length}</span>
      </h2>

      <div style={styles.sectionList}>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

// メインのアプリコンポーネント
export default function App() {
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem("rough-tasks");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("rough-tasks", JSON.stringify(tasks));
  }, [tasks]);

  const groupedTasks = useMemo(() => groupTasks(tasks), [tasks]);

  function addTask() {
    // 入力値から両端の余白を削除し、空文字なら何もせず終了
    const text = input.trim();
    if (!text) return;

    // 新しいタスクオブジェクトを作成
    const newTask = {
      id: crypto.randomUUID(),
      text,
      // テキスト中の「明日」「4/2」「4月2日」などから日付を推測
      date: parseLooseDate(text),
      createdAt: Date.now(),
      done: false,
    };

    // タスクリストの先頭に追加し、入力欄をクリア
    setTasks((prev) => [newTask, ...prev]);
    setInput("");
  }

  function toggleTask(id) {
    // 指定したタスクの完了状態を反転させる
    // done が true なら false に、false なら true に切り替える
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }

  function deleteTask(id) {
    // 指定した ID のタスクだけを残さずに削除する
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  const hasTasks = tasks.length > 0;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>殴り書きタスク</h1>
        <p style={styles.subtitle}>雑に書いて Enter するだけ</p>

        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addTask();
          }}
          placeholder="例：英語レポ 明日 / 3限 課題 / 4/2 提出 / ４月２日"
        />

        {!hasTasks ? (
          <p style={styles.empty}>まだタスクがありません</p>
        ) : (
          <div style={styles.sections}>
            {groupedTasks.map(([title, tasksInGroup]) => (
              <TaskSection
                key={title}
                title={title}
                tasks={tasksInGroup}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f5f5",
    padding: "40px 16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif',
  },
  card: {
    maxWidth: "640px",
    margin: "0 auto",
    background: "#fff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  },
  title: {
    margin: 0,
    fontSize: "28px",
  },
  subtitle: {
    marginTop: "8px",
    color: "#666",
    fontSize: "14px",
  },
  input: {
    width: "100%",
    marginTop: "20px",
    padding: "16px",
    fontSize: "16px",
    borderRadius: "12px",
    border: "1px solid #ddd",
    outline: "none",
    boxSizing: "border-box",
  },
  empty: {
    color: "#888",
    textAlign: "center",
    padding: "32px 0 8px",
  },
  sections: {
    marginTop: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  sectionCount: {
    fontSize: "12px",
    color: "#777",
    fontWeight: 500,
  },
  sectionList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 12px",
    border: "1px solid #eee",
    borderRadius: "12px",
    background: "#fafafa",
  },
  check: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
    flexShrink: 0,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
  },
  taskText: {
    fontSize: "15px",
    wordBreak: "break-word",
  },
  taskMeta: {
    marginTop: "6px",
    fontSize: "12px",
    color: "#777",
  },
  delete: {
    border: "none",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
    flexShrink: 0,
  },
};