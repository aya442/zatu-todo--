import { useEffect, useMemo, useState } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { auth, db, provider } from "./firebase.js";
import "./App.css";

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
    "本日",
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

  //以下、形式を正規表現で判定して、年付き・年なしスラッシュ日付と日本語日付を抽出
  // 2026/07/30
  const fullSlashMatch = input.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (fullSlashMatch) {
    const year = Number(fullSlashMatch[1]);
    const month = Number(fullSlashMatch[2]);
    const day = Number(fullSlashMatch[3]);
    return formatDate(new Date(year, month - 1, day));
  }

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
// - onMove はセクション（今日 / 明日 / 未設定）を GUI で変更するためのハンドラ
function TaskItem({ task, onToggle, onDelete, onEdit, onMove, sectionTitle }) {
  // 編集モードの ON/OFF
  const [isEditing, setIsEditing] = useState(false);
  // 編集中の入力内容を保持するローカル状態
  const [draftText, setDraftText] = useState(task.text);
  const [dragState, setDragState] = useState(null);

  // 親側から task.text が更新された場合、編集用テキストを最新化する
  useEffect(() => {
    setDraftText(task.text);
  }, [task.text]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event) => {
      if (event.pointerId !== dragState.pointerId) return;
      setDragState((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY } : prev));
    };

    const handlePointerUp = (event) => {
      if (event.pointerId !== dragState.pointerId) return;

      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-section-title]");
      const nextSection = target?.getAttribute("data-section-title");

      if (nextSection && nextSection !== sectionTitle) {
        onMove(task.id, nextSection);
      }

      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState, onMove, sectionTitle, task.id]);

  // 編集内容を保存して親コンポーネントに通知する
  const saveEdit = () => {
    const trimmed = draftText.trim();
    if (trimmed && trimmed !== task.text) {
      onEdit(task.id, trimmed);
    }
    setIsEditing(false);
  };

  // 編集をキャンセルして、元のタスク文言に戻す
  const cancelEdit = () => {
    setDraftText(task.text);
    setIsEditing(false);
  };

  const startTouchDrag = (event) => {
    if (isEditing) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (event.target.closest("button, input, textarea, select, a")) return;

    event.preventDefault();
    setDragState({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  };

  const isDragging = Boolean(dragState);

  return (
    <div
      style={{
        ...styles.item,
        ...(isDragging ? { opacity: 0.7, transform: "scale(1.01)" } : {}),
      }}
      className={`task-item${isDragging ? " dragging" : ""}`}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onPointerDown={startTouchDrag}
      onPointerCancel={() => setDragState(null)}
      title="指で長押しして移動できます"
    >
      <button
        onClick={() => onToggle(task.id)}
        style={{
          ...styles.check,
          opacity: task.done ? 0.5 : 1,
        }}
      >
        {task.done ? "✓" : "○"}
      </button>

      <div style={styles.taskBody} className="task-body">
        {isEditing ? (
          <>
            <input
              style={styles.editInput}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              autoFocus
            />
            <div style={styles.editButtons}>
              <button onClick={saveEdit} style={styles.saveButton}>
                保存
              </button>
              <button onClick={cancelEdit} style={styles.cancelButton}>
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="task-text"
              style={{
                ...styles.taskText,
                textDecoration: task.done ? "line-through" : "none",
                opacity: task.done ? 0.5 : 1,
              }}
            >
              {task.text}
            </div>
            <div style={styles.taskMetaRow} className="task-meta-row">
              <span style={styles.taskMeta}>{getRelativeLabel(task.date)}</span>
              <span style={styles.dragHint}>{isDragging ? "移動先を選択" : "移動"}</span>
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <button onClick={() => setIsEditing(true)} style={styles.edit}>
          編集
        </button>
      )}

      <button onClick={() => onDelete(task.id)} style={styles.delete}>
        削除
      </button>
    </div>
  );
}

// タスクのグループセクションのコンポーネント
function TaskSection({ title, tasks, onToggle, onDelete, onEdit, onMove, onRemoveSection }) {
  // セクション内にタスクをドロップしたときに移動を反映する
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onMove(taskId, title);
    }
  };

  return (
    <section
      style={styles.sectionCard}
      className="task-section-card"
      data-section-title={title}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <h2 style={styles.sectionTitle}>
        <span>{title}</span>
        <span style={styles.sectionCount}>{tasks.length}</span>
        {onRemoveSection && tasks.length === 0 && (
          <button
            type="button"
            style={styles.sectionRemove}
            onClick={() => onRemoveSection(title)}
          >
            ✕
          </button>
        )}
      </h2>

      <div style={styles.sectionList}>
        {tasks.length === 0 ? (
          <p style={styles.sectionEmpty}>タスクはありません</p>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              onMove={onMove}
              sectionTitle={title}
            />
          ))
        )}
      </div>
    </section>
  );
}

// メインのアプリコンポーネント
export default function App() {
  const [input, setInput] = useState("");
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("rough-theme");
    if (savedTheme) return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem("rough-tasks");
    return saved ? JSON.parse(saved) : [];
  });
  const [dateSections, setDateSections] = useState(() => {
    const saved = localStorage.getItem("rough-date-sections");
    return saved ? JSON.parse(saved) : [];
  });
  const [user, setUser] = useState(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [syncStatus, setSyncStatus] = useState("local");
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    const checkRedirect = async () => {
      try {
        await getRedirectResult(auth);
      } catch (error) {
        console.error("Redirect sign-in failed", error);
        setSyncError(error.message);
      }
    };

    checkRedirect();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthInitializing(false);
      setSyncError(null);
      setSyncStatus(nextUser ? "syncing" : "local");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const tasksCollection = collection(db, "users", user.uid, "tasks");
    const q = query(tasksCollection, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const remoteTasks = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setTasks(remoteTasks);
        setSyncStatus("synced");
      },
      (error) => {
        console.error("Firestore sync failed", error);
        setSyncError(error.message);
        setSyncStatus("error");
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    localStorage.setItem("rough-tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    setDateSections((prev) => {
      const today = formatDate(new Date());
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = formatDate(tomorrowDate);

      const labels = tasks
        .map((task) => task.date)
        .filter((date) => date && date !== today && date !== tomorrow);

      const next = [...new Set([...prev, ...labels])].sort();
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("rough-date-sections", JSON.stringify(dateSections));
  }, [dateSections]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("rough-theme", theme);
  }, [theme]);

  const groupedTasks = useMemo(() => groupTasks(tasks), [tasks]);

  const todayGroup =
    groupedTasks.find(([title]) => title === "今日") || ["今日", []];
  const tomorrowGroup =
    groupedTasks.find(([title]) => title === "明日") || ["明日", []];
  const unsetGroup =
    groupedTasks.find(([title]) => title === "未設定") || ["未設定", []];

  const taskDateLabels = groupedTasks
    .filter(([title]) => !["今日", "明日", "未設定"].includes(title))
    .map(([title]) => title);

  const allDateLabels = [...new Set([...dateSections, ...taskDateLabels])].sort();
  const dateGroups = allDateLabels.map((label) => [
    label,
    groupedTasks.find(([title]) => title === label)?.[1] || [],
  ]);

  async function saveTaskToFirestore(task) {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid, "tasks", task.id), task);
    } catch (error) {
      console.error("Firestore save failed", error);
      setSyncError(error.message);
      setSyncStatus("error");
    }
  }

  async function deleteTaskFromFirestore(id) {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "tasks", id));
    } catch (error) {
      console.error("Firestore delete failed", error);
      setSyncError(error.message);
      setSyncStatus("error");
    }
  }

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, provider);
      setSyncError(null);
    } catch (error) {
      console.warn("Popup sign-in failed, falling back to redirect", error);
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error("Redirect sign-in failed", redirectError);
        setSyncError(redirectError.message);
      }
    }
  };

  const signInAnonymouslyUser = async () => {
    try {
      await signInAnonymously(auth);
      setSyncError(null);
    } catch (error) {
      console.error("Anonymous sign in failed", error);
      setSyncError(error.message);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      setSyncStatus("local");
    } catch (error) {
      console.error("Sign out failed", error);
      setSyncError(error.message);
    }
  };

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
    saveTaskToFirestore(newTask);
    setInput("");
  }

  function toggleTask(id) {
    let updatedTask = null;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        updatedTask = { ...task, done: !task.done };
        return updatedTask;
      })
    );

    if (updatedTask) {
      saveTaskToFirestore(updatedTask);
    }
  }

  function deleteTask(id) {
    // 指定した ID のタスクだけを残さずに削除する
    setTasks((prev) => prev.filter((task) => task.id !== id));
    deleteTaskFromFirestore(id);
  }

  function removeDateSection(label) {
    setDateSections((prev) => prev.filter((section) => section !== label));
  }

  function editTask(id, newText) {
    let updatedTask = null;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        updatedTask = { ...task, text: newText };
        return updatedTask;
      })
    );

    if (updatedTask) {
      saveTaskToFirestore(updatedTask);
    }
  }

  // GUI のセクション移動から呼ばれるハンドラ
  // sectionLabel を受け取り、対応する日付を task.date に設定する
  // - 今日 / 明日 / 未設定 は特別扱い
  // - それ以外は日付ラベルのまま移動する
  function moveTask(id, sectionLabel) {
    let updatedTask = null;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;

        let nextDate = null;
        if (sectionLabel === "今日") {
          nextDate = formatDate(new Date());
        } else if (sectionLabel === "明日") {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          nextDate = formatDate(tomorrow);
        } else if (sectionLabel === "未設定") {
          nextDate = null;
        } else {
          nextDate = sectionLabel;
        }

        updatedTask = { ...task, date: nextDate };
        return updatedTask;
      })
    );

    if (updatedTask) {
      saveTaskToFirestore(updatedTask);
    }
  }

  const hasTasks = tasks.length > 0;

  if (authInitializing) {
    return (
      <div style={styles.page} className="app-shell">
        <div style={styles.container} className="app-container">
          <section style={styles.signInCard} className="app-input-card">
            <h1 style={styles.title} className="app-title">認証を確認中...</h1>
            <p style={styles.subtitle}>しばらくお待ちください。</p>
          </section>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.page} className="app-shell">
        <div style={styles.container} className="app-container">
          <section style={styles.signInCard} className="app-input-card">
            <h1 style={styles.title} className="app-title">ログインしてください</h1>
            <p style={styles.subtitle}>
              Firestore にタスクを保存して同期するには、googleログインしてください。
            </p>
            <p style={styles.subtitle}>
              Google アカウントでログインするか、匿名ログインを選択できます。
            </p>
            <div style={styles.signInChoices}>
              <button style={styles.signInButton} onClick={signInWithGoogle}>
                Google でログイン
              </button>
              <button style={styles.signInButtonSecondary} onClick={signInAnonymouslyUser}>
                匿名
              </button>
            </div>
            {syncError && <p style={styles.errorText}>認証に失敗しました: {syncError}</p>}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page} className="app-shell">
      <div style={styles.container} className="app-container">
        <section style={styles.inputCard} className="app-input-card">
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title} className="app-title">殴り書きタスク</h1>
              <p style={styles.subtitle} className="app-subtitle">雑に書いて Enter するだけ</p>
            </div>
            <div style={styles.topControls}>
              <button
                type="button"
                style={styles.themeToggle}
                className="theme-toggle"
                onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
              </button>
              <button
                type="button"
                style={styles.authButton}
                onClick={user ? signOutUser : signIn}
              >
                {authInitializing
                  ? "認証中..."
                  : user
                  ? "サインアウト"
                  : "Google でログイン"}
              </button>
            </div>
          </div>
          <div style={styles.statusRow}>
            {authInitializing ? (
              "認証を確認しています..."
            ) : user ? (
              <>
                <span style={styles.userInfo}>
                  {user.displayName || user.email} でログイン中
                </span>
                <span style={styles.syncInfo}>
                  {syncStatus === "synced" ? "同期済み" : syncStatus === "syncing" ? "同期中…" : syncStatus === "error" ? "同期エラー" : "ローカル"}
                </span>
              </>
            ) : (
              "ログインするとタスクが Firestore へ同期されます"
            )}
            {syncError && <span style={styles.errorText}>: {syncError}</span>}
          </div>

          <input
            style={styles.input}
            className="app-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
            placeholder="例：英語レポ 明日 / 3限 課題 / 4/2 提出 / ４月２日"
          />
        </section>

        <div style={styles.sectionsLayout} className="app-sections-layout">
          <TaskSection
            key={todayGroup[0]}
            title={todayGroup[0]}
            tasks={todayGroup[1]}
            onToggle={toggleTask}
            onDelete={deleteTask}
            onEdit={editTask}
            onMove={moveTask}
          />

          <div style={styles.bottomRow} className="app-bottom-row">
            <TaskSection
              key={tomorrowGroup[0]}
              title={tomorrowGroup[0]}
              tasks={tomorrowGroup[1]}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onEdit={editTask}
              onMove={moveTask}
            />
            <TaskSection
              key={unsetGroup[0]}
              title={unsetGroup[0]}
              tasks={unsetGroup[1]}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onEdit={editTask}
              onMove={moveTask}
            />
          </div>

          {dateGroups.length > 0 && (
            <div style={styles.otherRow} className="app-other-row">
              {dateGroups.map(([title, tasksInGroup]) => (
                <TaskSection
                  key={title}
                  title={title}
                  tasks={tasksInGroup}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                  onEdit={editTask}
                  onMove={moveTask}
                  onRemoveSection={removeDateSection}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--text)",
    padding: "40px 16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hiragino Sans", sans-serif',
  },
  container: {
    width: "100%",
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "24px 16px 40px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  inputCard: {
    background: "var(--surface)",
    borderRadius: "22px",
    padding: "28px 28px 24px",
    boxShadow: "0 10px 24px var(--shadow)",
    border: "1px solid var(--border)",
  },
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
  },
  themeToggle: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
    color: "var(--text)",
    borderRadius: "999px",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "14px",
    whiteSpace: "nowrap",
  },
  authButton: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
    color: "var(--text)",
    borderRadius: "999px",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: "14px",
    whiteSpace: "nowrap",
    marginLeft: "10px",
  },
  signInButton: {
    border: "1px solid var(--border)",
    background: "var(--surface-soft)",
    color: "var(--text)",
    borderRadius: "999px",
    padding: "14px 18px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 600,
    marginTop: "22px",
  },
  signInButtonSecondary: {
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    borderRadius: "999px",
    padding: "14px 18px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 600,
    marginTop: "22px",
  },
  signInChoices: {
    display: "grid",
    gap: "12px",
    marginTop: "20px",
  },
  topControls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  statusRow: {
    marginTop: "12px",
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    color: "var(--muted)",
    fontSize: "13px",
    lineHeight: "1.4",
  },
  userInfo: {
    fontWeight: 600,
  },
  syncInfo: {
    marginLeft: "8px",
  },
  errorText: {
    color: "#f87171",
  },
  signInCard: {
    padding: "32px 28px 26px",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    letterSpacing: "-0.03em",
  },
  subtitle: {
    marginTop: "10px",
    color: "var(--muted)",
    fontSize: "15px",
  },
  input: {
    width: "100%",
    marginTop: "24px",
    padding: "16px 14px",
    fontSize: "16px",
    borderRadius: "14px",
    border: "1px solid var(--border)",
    outline: "none",
    boxSizing: "border-box",
    background: "var(--surface-soft)",
    color: "var(--text)",
  },
  empty: {
    color: "#888",
    textAlign: "center",
    padding: "32px 0 8px",
  },
  sectionsLayout: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  topSection: {
    width: "100%",
    maxWidth: "720px",
    margin: "0 auto",
  },
  bottomRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "20px",
  },
  otherRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "20px",
  },
  sectionCard: {
    background: "var(--surface)",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 8px 18px var(--shadow)",
    minHeight: "180px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    border: "1px solid var(--border)",
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
    color: "var(--muted)",
    fontWeight: 500,
  },
  sectionRemove: {
    marginLeft: "auto",
    padding: "4px 8px",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    background: "var(--surface)",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "12px",
  },
  sectionList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minHeight: "120px",
  },
  sectionEmpty: {
    margin: 0,
    color: "var(--muted)",
    fontSize: "14px",
    padding: "22px 0",
    textAlign: "center",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 12px",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    background: "var(--surface-soft)",
  },
  check: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    cursor: "pointer",
    flexShrink: 0,
    color: "var(--accent)",
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
    color: "var(--muted)",
  },
  taskMetaRow: {
    marginTop: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    color: "#777",
    fontSize: "12px",
  },
  moveLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#444",
  },
  dragHint: {
    color: "var(--muted)",
    fontSize: "12px",
  },
  edit: {
    border: "none",
    background: "transparent",
    background: "transparent",
    color: "#444",
    cursor: "pointer",
    flexShrink: 0,
  },
  editInput: {
    width: "100%",
    padding: "12px",
    fontSize: "15px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
  },
  editButtons: {
    marginTop: "8px",
    display: "flex",
    gap: "8px",
  },
  saveButton: {
    border: "none",
    borderRadius: "10px",
    padding: "8px 12px",
    background: "var(--accent)",
    color: "#fff",
    cursor: "pointer",
  },
  cancelButton: {
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "8px 12px",
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
  },
  delete: {
    border: "none",
    background: "transparent",
    color: "var(--muted)",
    cursor: "pointer",
    flexShrink: 0,
  },
};