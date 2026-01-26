/**
 * ============================================================
 * 极简项目管理系统 - JavaScript 逻辑
 * ============================================================
 * 
 * 数据结构说明：
 * 存储在 localStorage 中的数据格式为 JSON 数组：
 * [
 *   {
 *     id: 1234567890,           // 项目唯一ID（时间戳）
 *     name: "项目名称",          // 项目名称
 *     planStartDate: "",        // 预计开始时间
 *     planEndDate: "",          // 预计结束时间
 *     planDuration: 0,          // 预计耗时（小时）
 *     actualStartDate: "",      // 实际开始时间
 *     actualEndDate: "",        // 实际结束时间
 *     actualDuration: 0,        // 实际耗时（小时）
 *     priority: "中",           // 重要度：低/中/高
 *     category: "工作",         // 类别：工作/学习/生活/其他
 *     bounty: 0,                // 赏金
 *     tasks: [                   // 任务数组
 *       {
 *         id: 1234567891,        // 任务唯一ID（时间戳）
 *         name: "任务名称",       // 任务名称
 *         planStartDate: "",     // 预计开始时间
 *         planEndDate: "",       // 预计结束时间
 *         planDuration: 0,      // 预计耗时（小时）
 *         actualStartDate: "",   // 实际开始时间
 *         actualEndDate: "",     // 实际结束时间
 *         actualDuration: 0,    // 实际耗时（小时）
 *         priority: "中",        // 重要度：低/中/高
 *         category: "工作",      // 类别：工作/学习/生活/其他
 *         bounty: 0,             // 赏金
 *         completed: false       // 是否完成
 *       }
 *     ]
 *   }
 * ]
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 防抖函数：在多次触发时，只在最后一次停止触发 wait 毫秒后执行
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} - 防抖后的函数
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// ============================================================
// 配置常量
// ============================================================

// Supabase 配置
const SUPABASE_URL = 'https://eidkzutoxsrzqrezldwz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGt6dXRveHNyenFyZXpsZHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTgxNTAsImV4cCI6MjA4NDU5NDE1MH0.HspWBpjYNsaiL7kRvQB53d3rK2foQMTM9AUyLzhaZ-k';

// 初始化 Supabase 客户端
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// localStorage 存储的键名（保留用于兼容性）
const STORAGE_KEY = 'projectManagerData';

// 启动 Supabase 实时监听
function setupRealtimeSubscription() {
    // 监听 projects 表变化
    supabaseClient
        .channel('projects-channel')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'projects' },
            async (payload) => {
                console.log('Project changed:', payload);
                await renderProjects();
                if (currentDetailProjectId) {
                    await renderProjectDetailContent();
                }
            }
        )
        .subscribe((status) => {
            console.log('Projects channel status:', status);
            // 如果断线，5秒后重连
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.log('Reconnecting projects channel in 5 seconds...');
                setTimeout(() => {
                    setupRealtimeSubscription();
                }, 5000);
            }
        });
    
    // 监听 tasks 表变化
    supabaseClient
        .channel('tasks-channel')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            async (payload) => {
                console.log('Task changed:', payload);
                await renderProjects();
                if (currentDetailProjectId) {
                    await renderProjectDetailContent();
                }
            }
        )
        .subscribe((status) => {
            console.log('Tasks channel status:', status);
            // 如果断线，5秒后重连
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.log('Reconnecting tasks channel in 5 seconds...');
                setTimeout(() => {
                    setupRealtimeSubscription();
                }, 5000);
            }
        });
}

// ============================================================
// 时间验证辅助函数
// ============================================================

/**
 * 计算两个日期之间的小时差
 * @param {string} startDate - 开始日期 YYYY-MM-DD
 * @param {string} endDate - 结束日期 YYYY-MM-DD
 * @returns {number} 小时数（假设工作时间为8小时/天）
 */
function calculateHoursBetweenDates(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end - start;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays * 8; // 假设每天工作8小时
}

/**
 * 验证项目表单的时间一致性
 * 检查：开始时间 + 耗时 ≈ 结束时间
 */
function validateProjectTimeConsistency() {
    validateTimeConsistency('modal', 'Plan');
    validateTimeConsistency('modal', 'Actual');
}

/**
 * 验证任务表单的时间一致性
 */
function validateTaskTimeConsistency() {
    validateTimeConsistency('modalTask', 'Plan');
    validateTimeConsistency('modalTask', 'Actual');
}

/**
 * 通用时间一致性验证
 * @param {string} prefix - 字段ID前缀（modal 或 modalTask）
 * @param {string} type - 类型（Plan 或 Actual）
 */
function validateTimeConsistency(prefix, type) {
    const startDateEl = document.getElementById(`${prefix}${type}StartDate`);
    const endDateEl = document.getElementById(`${prefix}${type}EndDate`);
    const durationEl = document.getElementById(`${prefix}${type}Duration`);
    
    if (!startDateEl || !endDateEl || !durationEl) return;
    
    const startDate = startDateEl.value;
    const endDate = endDateEl.value;
    const duration = parseFloat(durationEl.value) || 0;
    
    // 清除之前的错误标记
    endDateEl.classList.remove('invalid');
    
    // 只有当三个值都有时才验证
    if (startDate && endDate && duration > 0) {
        const calculatedHours = calculateHoursBetweenDates(startDate, endDate);
        const diff = Math.abs(calculatedHours - duration);
        
        // 如果差距在1小时内，标红结束时间
        if (diff > 0 && diff <= 1) {
            endDateEl.classList.add('invalid');
        }
    }
}

// ============================================================
// 数据操作函数 - 读取和保存
// ============================================================

/**
 * 从 Supabase 读取所有项目数据
 * @returns {Promise<Array>} 项目数组，如果没有数据则返回空数组
 */
async function getProjects() {
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .select(`
                *,
                tasks (*)
            `)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading projects:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Error fetching projects:', err);
        return [];
    }
}

/**
 * 保存单个项目到 Supabase
 * @param {Object} project - 要保存的项目对象
 */
async function saveProject(project) {
    try {
        // 准备项目数据（不包含tasks）
        const { tasks, ...projectData } = project;
        
        // 保存或更新项目
        const { data: savedProject, error: projectError } = await supabaseClient
            .from('projects')
            .upsert(projectData)
            .select()
            .single();
        
        if (projectError) {
            console.error('Error saving project:', projectError);
            return;
        }
        
        // 如果有任务，保存任务
        if (tasks && tasks.length > 0) {
            // 为每个任务添加 project_id
            const tasksWithProjectId = tasks.map(task => ({
                ...task,
                project_id: savedProject.id
            }));
            
            const { error: tasksError } = await supabaseClient
                .from('tasks')
                .upsert(tasksWithProjectId);
            
            if (tasksError) {
                console.error('Error saving tasks:', tasksError);
            }
        }
    } catch (err) {
        console.error('Error in saveProject:', err);
    }
}

/**
 * 保存多个项目到 Supabase（兼容旧代码）
 * @param {Array} projects - 要保存的项目数组
 */
async function saveProjects(projects) {
    for (const project of projects) {
        await saveProject(project);
    }
}

// ============================================================
// 新建项目浮层操作函数
// ============================================================

/**
 * 打开新建项目浮层
 * 显示浮层并重置所有输入项为默认值
 */
function openCreateProjectModal() {
    // 获取浮层元素
    const modal = document.getElementById('createProjectModal');
    
    // 重置所有输入框和下拉框为默认值
    resetModalForm();
    // 设置标题与按钮文本（新建模式）
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '新建项目';
    const confirmBtn = modal.querySelector('.modal-footer .btn-primary');
    if (confirmBtn) confirmBtn.textContent = '确认';
    // 清空编辑态
    currentEditingProjectId = null;
    
    // 显示浮层
    modal.style.display = 'flex';
}

/**
 * 关闭新建项目浮层
 * 隐藏浮层，不保存任何输入内容
 */
function closeCreateProjectModal() {
    const modal = document.getElementById('createProjectModal');
    modal.style.display = 'none';
    
    // 如果需要，重新打开项目详情浮层
    const shouldReturnToDetail = window._returnToProjectDetailId;
    
    // 关闭时恢复新建文案并清空编辑态
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '新建项目';
    const confirmBtn = modal.querySelector('.modal-footer .btn-primary');
    if (confirmBtn) confirmBtn.textContent = '确认创建';
    currentEditingProjectId = null;
    window._returnToProjectDetailId = null;
    
    // 如果需要，重新打开项目详情浮层
    if (shouldReturnToDetail) {
        openProjectDetailModal(shouldReturnToDetail);
    }
}

/**
 * 重置浮层表单为初始状态
 * 清空所有输入框，下拉框恢复默认选中值
 */
function resetModalForm() {
    // 清空文本输入框
    document.getElementById('modalProjectName').value = '';
    
    // 设置默认时间值：当前时间向下取整
    const now = new Date();
    now.setMinutes(0, 0, 0); // 向下取整到小时
    const defaultStart = formatDateForInput(now);
    const defaultEnd = formatDateForInput(new Date(now.getTime() + 3600000)); // +1小时
    
    document.getElementById('modalPlanStartDate').value = defaultStart;
    document.getElementById('modalPlanEndDate').value = defaultEnd;
    document.getElementById('modalActualStartDate').value = '';
    document.getElementById('modalActualEndDate').value = '';
    
    // 设置默认耗时1小时
    document.getElementById('modalPlanDuration').value = '1';
    document.getElementById('modalActualDuration').value = '';
    
    // 重置下拉框为默认值
    document.getElementById('modalPriority').value = '中';
    document.getElementById('modalCategory').value = '工作';
    
    // 清空数字输入框
    document.getElementById('modalBounty').value = '';
}

/**
 * 确认创建项目
 * 验证输入、收集数据、保存到Supabase、刷新列表
 */
async function confirmCreateProject() {
    // ① 验证：名称不能为空
    const name = document.getElementById('modalProjectName').value.trim();
    if (!name) {
        alert('请填写项目名称');
        return;
    }
    
    // ② 收集：获取所有输入项的值
    const planStartDate = document.getElementById('modalPlanStartDate').value;
    const planEndDate = document.getElementById('modalPlanEndDate').value;
    const planDuration = parseFloat(document.getElementById('modalPlanDuration').value) || 0;
    const actualStartDate = document.getElementById('modalActualStartDate').value;
    const actualEndDate = document.getElementById('modalActualEndDate').value;
    const actualDuration = parseFloat(document.getElementById('modalActualDuration').value) || 0;
    const priority = document.getElementById('modalPriority').value;
    const category = document.getElementById('modalCategory').value;
    const bountyValue = document.getElementById('modalBounty').value;
    // 赏金转换为数字，如果为空则默认为0
    const bounty = bountyValue ? parseFloat(bountyValue) : 0;
    
    const projects = await getProjects();
    if (currentEditingProjectId) {
        // 编辑项目模式：更新已有项目
        const project = projects.find(p => p.id === currentEditingProjectId);
        if (project) {
            project.name = name;
            project.plan_start_date = planStartDate || null;
            project.plan_end_date = planEndDate || null;
            project.plan_duration = planDuration;
            project.actual_start_date = actualStartDate || null;
            project.actual_end_date = actualEndDate || null;
            project.actual_duration = actualDuration;
            project.priority = priority;
            project.category = category;
            project.bounty = bounty;
            await saveProject(project);
        }
    } else {
        // 新建项目模式
        const newProject = {
            id: Date.now(),
            name,
            plan_start_date: planStartDate || null,
            plan_end_date: planEndDate || null,
            plan_duration: planDuration,
            actual_start_date: actualStartDate || null,
            actual_end_date: actualEndDate || null,
            actual_duration: actualDuration,
            priority,
            category,
            bounty,
            tasks: []
        };
        await saveProject(newProject);
    }
    
    // ④ 刷新：隐藏浮层，重新渲染项目列表
    closeCreateProjectModal();
    await renderProjects();
    
    // ⑤ 清空：下次打开时表单会被resetModalForm()重置
}

// ============================================================
// 项目操作函数 - 增删改查
// ============================================================

// 当前处于编辑模式的项目ID（null 表示新建）
let currentEditingProjectId = null;

// 当前详情浮层的项目ID（null 表示未打开）
let currentDetailProjectId = null;

// 任务依赖关系相关变量
let currentEditingTaskId = null;        // 当前正在编辑的任务ID
let currentEditingTaskProjectId = null; // 当前正在编辑的任务所属项目ID
let selectedPrerequisites = [];         // 当前选择的前置任务ID列表

/**
 * 打开编辑项目浮层（复用新建项目浮层）
 * @param {number} projectId 
 */
async function openEditProjectModal(projectId) {
    const projects = await getProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    // 如果项目详情浮层是打开的，先关闭它并记录返回路径
    const detailModal = document.getElementById('projectDetailModal');
    let shouldReturnToDetail = null;
    if (detailModal && detailModal.style.display === 'flex') {
        detailModal.style.display = 'none';
        shouldReturnToDetail = currentDetailProjectId;
    }

    currentEditingProjectId = projectId;
    // 记录是否需要返回项目详情
    if (shouldReturnToDetail) {
        window._returnToProjectDetailId = shouldReturnToDetail;
    } else {
        window._returnToProjectDetailId = null;
    }

    // 填充表单（映射数据库字段名）
    document.getElementById('modalProjectName').value = project.name || '';
    document.getElementById('modalPlanStartDate').value = project.plan_start_date || '';
    document.getElementById('modalPlanEndDate').value = project.plan_end_date || '';
    
    const planDurationField = document.getElementById('modalPlanDuration');
    const planDuration = project.plan_duration ?? '';
    planDurationField.setAttribute('data-hours', planDuration);
    planDurationField.value = planDuration ? formatDuration(planDuration) : '';
    
    document.getElementById('modalActualStartDate').value = project.actual_start_date || '';
    document.getElementById('modalActualEndDate').value = project.actual_end_date || '';
    
    const actualDurationField = document.getElementById('modalActualDuration');
    const actualDuration = project.actual_duration ?? '';
    actualDurationField.setAttribute('data-hours', actualDuration);
    actualDurationField.value = actualDuration ? formatDuration(actualDuration) : '';
    
    document.getElementById('modalPriority').value = project.priority || '中';
    document.getElementById('modalCategory').value = project.category || '工作';
    document.getElementById('modalBounty').value = project.bounty ?? '';

    // 更新标题
    const modal = document.getElementById('createProjectModal');
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '编辑项目';

    // 显示浮层
    modal.style.display = 'flex';
    
    // 更新相对时间显示
    updateProjectRelativeTimes();
    
    // 绑定实时保存事件
    attachProjectAutoSaveListeners();
}

/**
 * 打开项目详情浮层
 * @param {number} projectId 
 */
function openProjectDetailModal(projectId) {
    currentDetailProjectId = projectId;
    const modal = document.getElementById('projectDetailModal');
    modal.style.display = 'flex';
    renderProjectDetailContent();
}

/**
 * 关闭项目详情浮层
 */
function closeProjectDetailModal() {
    const modal = document.getElementById('projectDetailModal');
    modal.style.display = 'none';
    currentDetailProjectId = null;
}

/**
 * 渲染项目详情内容（标题、元信息、任务列表）
 */
async function renderProjectDetailContent() {
    if (!currentDetailProjectId) return;
    const projects = await getProjects();
    const project = projects.find(p => p.id === currentDetailProjectId);
    if (!project) return;

    // 标题
    const titleEl = document.getElementById('projectDetailTitle');
    if (titleEl) titleEl.textContent = project.name;

    // 从任务中汇总计算项目时间和耗时
    let planStart = null, planEnd = null, planDurationSum = 0;
    let actualStart = null, actualEnd = null, actualDurationSum = 0;
    
    if (project.tasks && project.tasks.length > 0) {
        project.tasks.forEach(task => {
            // 预计时间
            if (task.plan_start_date) {
                const taskStart = new Date(task.plan_start_date);
                if (!planStart || taskStart < planStart) planStart = taskStart;
            }
            if (task.plan_end_date) {
                const taskEnd = new Date(task.plan_end_date);
                if (!planEnd || taskEnd > planEnd) planEnd = taskEnd;
            }
            if (task.plan_duration) {
                planDurationSum += parseFloat(task.plan_duration);
            }
            
            // 实际时间
            if (task.actual_start_date) {
                const taskStart = new Date(task.actual_start_date);
                if (!actualStart || taskStart < actualStart) actualStart = taskStart;
            }
            if (task.actual_end_date) {
                const taskEnd = new Date(task.actual_end_date);
                if (!actualEnd || taskEnd > actualEnd) actualEnd = taskEnd;
            }
            if (task.actual_duration) {
                actualDurationSum += parseFloat(task.actual_duration);
            }
        });
    }
    
    // 格式化显示
    const planStartStr = planStart ? planStart.toISOString().slice(0, 16).replace('T', ' ') : '—';
    const planEndStr = planEnd ? planEnd.toISOString().slice(0, 16).replace('T', ' ') : '—';
    const planDurationStr = planDurationSum > 0 ? formatDuration(planDurationSum) : '—';
    
    const actualStartStr = actualStart ? actualStart.toISOString().slice(0, 16).replace('T', ' ') : '—';
    const actualEndStr = actualEnd ? actualEnd.toISOString().slice(0, 16).replace('T', ' ') : '—';
    const actualDurationStr = actualDurationSum > 0 ? formatDuration(actualDurationSum) : '—';

    // 元信息（简要展示）
    const metaEl = document.getElementById('projectDetailMeta');
    if (metaEl) {
        metaEl.innerHTML = `
            <div class="detail-info-text">
                <div><span class="detail-label">预计：</span>${planStartStr} <span class="detail-label">至</span> ${planEndStr}　<span class="detail-label">耗时：</span>${planDurationStr}</div>
                <div><span class="detail-label">实际：</span>${actualStartStr} <span class="detail-label">至</span> ${actualEndStr}　<span class="detail-label">耗时：</span>${actualDurationStr}</div>
                <div><span class="detail-label">重要度：</span>${project.priority || '—'}　<span class="detail-label">类别：</span>${project.category || '—'}　<span class="detail-label">赏金：</span>${project.bounty ?? 0}</div>
            </div>
        `;
    }

    // 任务列表
    const tasksEl = document.getElementById('projectDetailTasks');
    if (tasksEl) {
        tasksEl.innerHTML = project.tasks.length === 0
            ? '<div class="task-empty">暂无任务</div>'
            : project.tasks.map(task => `
                <div class="task-item">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${project.id}, ${task.id}); renderProjectDetailContent();">
                    <span class="task-name ${task.completed ? 'completed' : ''}" id="task-name-${task.id}" onclick="startEditTask(${project.id}, ${task.id})">${escapeHtml(task.name)}</span>
                    <button class="btn-danger" onclick="deleteTask(${project.id}, ${task.id})">删除</button>
                </div>
            `).join('');
    }

    // 渲染任务关系图
    renderTaskGraph(project.tasks);

    // 底部按钮绑定
    const editBtn = document.getElementById('detailEditProjectBtn');
    if (editBtn) editBtn.onclick = () => openEditProjectModal(project.id);
    const addTaskBtn = document.getElementById('detailAddTaskBtn');
    if (addTaskBtn) addTaskBtn.onclick = () => openAddTaskForProject(project.id);
}

/**
 * 打开“添加任务”浮层（复用编辑任务浮层，taskId=null）
 * @param {number} projectId 
 */
async function openAddTaskForProject(projectId) {    // 关闭项目详情浮层并记录返回路径
    const detailModal = document.getElementById('projectDetailModal');
    if (detailModal && detailModal.style.display === 'flex') {
        detailModal.style.display = 'none';
        currentEditingTask.returnToProjectDetail = currentDetailProjectId;
    } else {
        currentEditingTask.returnToProjectDetail = null;
    }
        currentEditingTask.projectId = projectId;
    currentEditingTask.taskId = null; // 新建任务
    
    // 计算默认时间：当前时间向下取整到小时
    const now = new Date();
    now.setMinutes(0, 0, 0); // 向下取整到小时
    const defaultStart = formatDateForInput(now);
    const defaultEnd = formatDateForInput(new Date(now.getTime() + 3600000)); // +1小时
    
    // 清空表单并设置默认值
    document.getElementById('modalTaskName').value = '';
    document.getElementById('modalTaskPlanStartDate').value = defaultStart;
    document.getElementById('modalTaskPlanDuration').value = '1';
    document.getElementById('modalTaskPlanEndDate').value = defaultEnd;
    document.getElementById('modalTaskActualStartDate').value = '';
    document.getElementById('modalTaskActualDuration').value = '';
    document.getElementById('modalTaskActualEndDate').value = '';
    document.getElementById('modalTaskPriority').value = '中';
    // 类别默认继承项目
    const projects = await getProjects();
    const project = projects.find(p => p.id === projectId);
    document.getElementById('modalTaskCategory').value = project?.category || '工作';
    document.getElementById('modalTaskBounty').value = '';
    document.getElementById('modalTaskCompleted').value = 'false';

    // 修改标题为“添加任务”并显示
    const modal = document.getElementById('editTaskModal');
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '添加任务';
    
    // 显示确认按钮
    const footer = document.getElementById('taskModalFooter');
    if (footer) footer.style.display = 'flex';
    
    modal.style.display = 'flex';
    
    // 更新相对时间显示
    updateTaskRelativeTimes();
}

/**
 * 添加新项目（保留此函数以兼容可能的旧调用，但主要使用浮层方式创建）
 * @deprecated 建议使用 openCreateProjectModal() 和 confirmCreateProject()
 */
async function addProject() {
    const input = document.getElementById('projectInput');
    if (!input) return; // 如果输入框不存在，直接返回
    
    const name = input.value.trim();
    
    // 验证输入不为空
    if (!name) {
        alert('请输入项目名称！');
        return;
    }

    // 读取现有项目
    const projects = await getProjects();
    
    // 创建新项目对象
    const newProject = {
        id: Date.now(),        // 使用时间戳作为唯一ID
        name: name,            // 项目名称
        tasks: []              // 初始化空任务数组
    };
    
    // 将新项目添加到数组
    projects.push(newProject);
    
    // 保存到 localStorage
    saveProjects(projects);
    
    // 清空输入框并重新渲染
    input.value = '';
    renderProjects();
}

/**
 * 删除项目
 * @param {number} projectId - 要删除的项目ID
 */
async function deleteProject(projectId) {
    if (!confirm('确定要删除这个项目吗？所有任务也会被删除！')) {
        return;
    }

    try {
        // 直接从数据库删除项目（CASCADE会自动删除关联的任务）
        const { error } = await supabaseClient
            .from('projects')
            .delete()
            .eq('id', projectId);
        
        if (error) {
            console.error('Error deleting project:', error);
            return;
        }
        
        await renderProjects();
        
        // 如果当前在项目详情页，关闭详情页
        if (currentDetailProjectId === projectId) {
            closeProjectDetail();
        }
    } catch (err) {
        console.error('Error in deleteProject:', err);
    }
}

/**
 * 开始编辑项目名称（显示输入框）
 * @param {number} projectId - 项目ID
 */
function startEditProject(projectId) {
    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    
    // 获取标题元素并替换为输入框
    const titleEl = document.getElementById(`project-title-${projectId}`);
    titleEl.innerHTML = `
        <input type="text" class="project-title-input" 
               id="edit-project-${projectId}" 
               value="${escapeHtml(project.name)}"
               onkeypress="handleEditProjectKeypress(event, ${projectId})"
               onblur="saveProjectName(${projectId})">
    `;
    
    // 自动聚焦输入框
    document.getElementById(`edit-project-${projectId}`).focus();
}

/**
 * 保存编辑后的项目名称
 * @param {number} projectId - 项目ID
 */
async function saveProjectName(projectId) {
    const input = document.getElementById(`edit-project-${projectId}`);
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        await renderProjects(); // 如果为空，恢复原来的显示
        return;
    }

    // 读取、修改、保存
    const projects = await getProjects();
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        await saveProject(project);
    }
    
    await renderProjects();
}

// ============================================================
// 任务操作函数 - 增删改查
// ============================================================

/**
 * 添加新任务到指定项目
 * @param {number} projectId - 项目ID
 */
async function addTask(projectId) {
    const input = document.getElementById(`task-input-${projectId}`);
    const name = input.value.trim();
    
    if (!name) {
        alert('请输入任务名称！');
        return;
    }

    // 读取项目数据
    const projects = await getProjects();
    
    // 找到对应的项目
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
        // 计算默认时间：当前时间向下取整
        const now = new Date();
        now.setMinutes(0, 0, 0); // 向下取整到小时
        const defaultStart = formatDateForInput(now);
        const defaultEnd = formatDateForInput(new Date(now.getTime() + 3600000)); // +1小时
        
        // 创建新任务对象（完整结构）
        const newTask = {
            id: Date.now(),              // 任务唯一ID
            name: name,                  // 任务名称
            planStartDate: defaultStart, // 预计开始时间（默认当前时间向下取整）
            planEndDate: defaultEnd,     // 预计结束时间（默认开始+1小时）
            planDuration: 1,             // 预计耗时（默认1小时）
            actualStartDate: '',         // 实际开始时间（默认为空）
            actualEndDate: '',           // 实际结束时间（默认为空）
            actualDuration: 0,           // 实际耗时（默认为0）
            priority: '中',              // 重要度（默认：中）
            category: project.category || '工作',  // 类别（继承项目类别）
            bounty: 0,                   // 赏金（默认为 0）
            completed: false             // 初始状态：未完成
        };
        
        // 添加到项目的任务数组
        project.tasks.push(newTask);
        
        // 保存到 localStorage
        saveProjects(projects);
    }
    
    // 清空输入框并重新渲染
    input.value = '';
    renderProjects();
}

/**
 * 删除任务
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
async function deleteTask(projectId, taskId) {
    try {
        // 直接从数据库删除任务
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', taskId);
        
        if (error) {
            console.error('Error deleting task:', error);
            return;
        }
        
        await renderProjects();
        
        // 如果当前在项目详情页，也刷新详情页
        if (currentDetailProjectId) {
            await renderProjectDetailContent();
        }
    } catch (err) {
        console.error('Error in deleteTask:', err);
    }
}

/**
 * 切换任务完成状态
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
async function toggleTask(projectId, taskId) {
    try {
        // 获取当前任务状态
        const { data: task, error: fetchError } = await supabaseClient
            .from('tasks')
            .select('completed')
            .eq('id', taskId)
            .single();
        
        if (fetchError) {
            console.error('Error fetching task:', fetchError);
            return;
        }
        
        // 切换状态
        const { error: updateError } = await supabaseClient
            .from('tasks')
            .update({ completed: !task.completed })
            .eq('id', taskId);
        
        if (updateError) {
            console.error('Error updating task:', updateError);
            return;
        }
        
        await renderProjects();
    } catch (err) {
        console.error('Error in toggleTask:', err);
    }
}

/**
 * 开始编辑任务名称
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
function startEditTask(projectId, taskId) {
    // 设置编辑模式标题
    openEditTaskModal(projectId, taskId);
    const modal = document.getElementById('editTaskModal');
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '编辑任务';
}

// ============================================================
// 任务编辑浮层函数
// ============================================================

// 当前正在编辑的任务信息
let currentEditingTask = {
    projectId: null,
    taskId: null
};

/**
 * 打开任务编辑浮层
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
async function openEditTaskModal(projectId, taskId) {
    const projects = await getProjects();
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    
    if (!task) {
        alert('任务不存在！');
        return;
    }

    // 如果项目详情浮层是打开的，先关闭它并记录返回路径
    const detailModal = document.getElementById('projectDetailModal');
    if (detailModal && detailModal.style.display === 'flex') {
        detailModal.style.display = 'none';
        currentEditingTask.returnToProjectDetail = currentDetailProjectId;
    } else {
        currentEditingTask.returnToProjectDetail = null;
    }

    // 记录当前编辑的任务
    currentEditingTask.projectId = projectId;
    currentEditingTask.taskId = taskId;

    // 保存任务ID和项目ID到任务名称字段的dataset（供任务关联功能使用）
    const taskNameField = document.getElementById('modalTaskName');
    taskNameField.dataset.taskId = taskId;
    taskNameField.dataset.projectId = projectId;

    // 填充表单数据（映射数据库字段）
    document.getElementById('modalTaskName').value = task.name || '';
    document.getElementById('modalTaskPlanStartDate').value = task.plan_start_date || '';
    document.getElementById('modalTaskPlanEndDate').value = task.plan_end_date || '';
    
    const planDurationField = document.getElementById('modalTaskPlanDuration');
    const planDuration = task.plan_duration ?? '';
    planDurationField.setAttribute('data-hours', planDuration);
    planDurationField.value = planDuration ? formatDuration(planDuration) : '';
    
    document.getElementById('modalTaskActualStartDate').value = task.actual_start_date || '';
    document.getElementById('modalTaskActualEndDate').value = task.actual_end_date || '';
    
    const actualDurationField = document.getElementById('modalTaskActualDuration');
    const actualDuration = task.actual_duration ?? '';
    actualDurationField.setAttribute('data-hours', actualDuration);
    actualDurationField.value = actualDuration ? formatDuration(actualDuration) : '';
    
    // 设置优先级（兼容新旧格式）
    let priorityValue;
    if (typeof task.priority === 'object' && task.priority !== null) {
        // 如果是对象，转换为 JSON 字符串
        priorityValue = JSON.stringify(task.priority);
    } else if (typeof task.priority === 'string') {
        // 如果是字符串，直接使用
        priorityValue = task.priority || '{"importance": 0, "urgency": 0}';
    } else {
        // 默认值
        priorityValue = '{"importance": 0, "urgency": 0}';
    }
    document.getElementById('modalTaskPriority').value = priorityValue;
    updatePriorityButtonDisplay();
    
    document.getElementById('modalTaskCategory').value = task.category || '工作';
    document.getElementById('modalTaskBounty').value = task.bounty || 0;
    document.getElementById('modalTaskCompleted').value = task.completed ? 'true' : 'false';

    // 显示浮层
    document.getElementById('editTaskModal').style.display = 'flex';
    
    // 隐藏确认按钮（编辑模式不需要）
    const footer = document.getElementById('taskModalFooter');
    if (footer) footer.style.display = 'none';
    
    // 更新相对时间显示
    updateTaskRelativeTimes();
    
    // 绑定实时保存事件
    attachTaskAutoSaveListeners();
}

/**
 * 关闭任务编辑浮层
 */
function closeEditTaskModal() {
    document.getElementById('editTaskModal').style.display = 'none';
    
    // 如果需要返回项目详情，重新打开它
    const shouldReturnToDetail = currentEditingTask.returnToProjectDetail;
    
    // 清空表单
    document.getElementById('modalTaskName').value = '';
    document.getElementById('modalTaskPlanStartDate').value = '';
    document.getElementById('modalTaskPlanEndDate').value = '';
    document.getElementById('modalTaskPlanDuration').value = '';
    document.getElementById('modalTaskActualStartDate').value = '';
    document.getElementById('modalTaskActualEndDate').value = '';
    document.getElementById('modalTaskActualDuration').value = '';
    document.getElementById('modalTaskPriority').value = '中';
    document.getElementById('modalTaskCategory').value = '工作';
    document.getElementById('modalTaskBounty').value = '';
    document.getElementById('modalTaskCompleted').value = 'false';
    
    // 清空当前编辑状态
    currentEditingTask.projectId = null;
    currentEditingTask.taskId = null;
    currentEditingTask.returnToProjectDetail = null;
    
    // 如果需要，重新打开项目详情浮层
    if (shouldReturnToDetail) {
        openProjectDetailModal(shouldReturnToDetail);
    }
}

/**
 * 确认保存任务编辑
 * 修复：添加 async/await 正确处理异步操作
 */
async function confirmEditTask() {
    // 获取表单数据
    const name = document.getElementById('modalTaskName').value.trim();
    const planStartDate = document.getElementById('modalTaskPlanStartDate').value;
    const planEndDate = document.getElementById('modalTaskPlanEndDate').value;
    const planDuration = parseFloat(document.getElementById('modalTaskPlanDuration').value) || 0;
    const actualStartDate = document.getElementById('modalTaskActualStartDate').value;
    const actualEndDate = document.getElementById('modalTaskActualEndDate').value;
    const actualDuration = parseFloat(document.getElementById('modalTaskActualDuration').value) || 0;
    const priority = document.getElementById('modalTaskPriority').value;
    const category = document.getElementById('modalTaskCategory').value;
    const bounty = parseFloat(document.getElementById('modalTaskBounty').value) || 0;
    const completed = document.getElementById('modalTaskCompleted').value === 'true';

    // 验证必填字段
    if (!name) {
        alert('请输入任务名称！');
        return;
    }

    // 更新或新建任务数据
    const projects = await getProjects();  // 修复：添加 await
    const project = projects.find(p => p.id === currentEditingTask.projectId);
    if (project) {
        if (currentEditingTask.taskId) {
            // 编辑任务
            const task = project.tasks.find(t => t.id === currentEditingTask.taskId);
            if (task) {
                task.name = name;
                task.planStartDate = planStartDate;
                task.planEndDate = planEndDate;
                task.planDuration = planDuration;
                task.actualStartDate = actualStartDate;
                task.actualEndDate = actualEndDate;
                task.actualDuration = actualDuration;
                task.priority = priority;
                task.category = category;
                task.bounty = bounty;
                task.completed = completed;
            }
        } else {
            // 新建任务
            project.tasks.push({
                id: Date.now(),
                name,
                planStartDate,
                planEndDate,
                planDuration,
                actualStartDate,
                actualEndDate,
                actualDuration,
                priority,
                category,
                bounty,
                completed
            });
        }
        await saveProjects(projects);  // 修复：添加 await
        // 移除手动渲染，Realtime 会自动处理
        // await renderProjects();
        // renderProjectDetailContent();
    }

    // 关闭浮层
    closeEditTaskModal();
}

/**
 * 确认添加任务
 */
async function confirmAddTask() {
    // 获取表单数据
    const name = document.getElementById('modalTaskName').value.trim();
    const planStartDate = document.getElementById('modalTaskPlanStartDate').value;
    const planEndDate = document.getElementById('modalTaskPlanEndDate').value;
    const planDuration = parseFloat(document.getElementById('modalTaskPlanDuration').value) || 0;
    const actualStartDate = document.getElementById('modalTaskActualStartDate').value;
    const actualEndDate = document.getElementById('modalTaskActualEndDate').value;
    const actualDuration = parseFloat(document.getElementById('modalTaskActualDuration').value) || 0;
    const priority = document.getElementById('modalTaskPriority').value;
    const category = document.getElementById('modalTaskCategory').value;
    const bounty = parseFloat(document.getElementById('modalTaskBounty').value) || 0;
    const completed = document.getElementById('modalTaskCompleted').value === 'true';

    // 验证必填字段
    if (!name) {
        alert('请输入任务名称！');
        return;
    }

    try {
        // 新建任务直接插入数据库
        const { error } = await supabaseClient
            .from('tasks')
            .insert({
                id: Date.now(),
                project_id: currentEditingTask.projectId,
                name,
                plan_start_date: planStartDate || null,
                plan_end_date: planEndDate || null,
                plan_duration: planDuration,
                actual_start_date: actualStartDate || null,
                actual_end_date: actualEndDate || null,
                actual_duration: actualDuration,
                priority,
                category,
                bounty,
                completed
            });
        
        if (error) {
            console.error('Error creating task:', error);
            alert('创建任务失败，请重试');
            return;
        }
        
        await renderProjects();
        await renderProjectDetailContent();
    } catch (err) {
        console.error('Error in confirmAddTask:', err);
        alert('创建任务失败，请重试');
    }

    // 关闭浮层
    closeEditTaskModal();
}

/**
 * 保存编辑后的任务名称（已废弃，现在使用浮层）
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
async function saveTaskName(projectId, taskId) {
    const input = document.getElementById(`edit-task-${taskId}`);
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        await renderProjects();
        return;
    }

    const projects = await getProjects();
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    
    if (task) {
        task.name = newName;
        await saveProjects(projects);
    }
    
    await renderProjects();
}

// ============================================================
// 界面渲染函数
// ============================================================

/**
 * 渲染所有项目到页面
 */
async function renderProjects() {
    const container = document.getElementById('projectList');
    const projects = await getProjects();

    // 如果没有项目，显示空状态提示
    if (projects.length === 0) {
        container.innerHTML = '<div class="empty-message">暂无项目，请创建第一个项目</div>';
        return;
    }

    // 生成项目列表 HTML（Dashboard 仅显示项目，不显示任务）
    container.innerHTML = projects.map(project => `
        <div class="project-card" onclick="openProjectDetailModal(${project.id})">
            <div class="project-header">
                <span class="project-title" id="project-title-${project.id}" ondblclick="event.stopPropagation(); startEditProject(${project.id})">
                    ${escapeHtml(project.name)}
                </span>
                <div class="project-actions" onclick="event.stopPropagation();">
                    <button class="btn-danger" onclick="deleteProject(${project.id})">删除</button>
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * HTML 转义，防止 XSS 攻击
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// 键盘事件处理
// ============================================================

/**
 * 处理项目输入框的回车键
 * @param {KeyboardEvent} event - 键盘事件
 */
function handleProjectInputKeypress(event) {
    if (event.key === 'Enter') {
        addProject();
    }
}

/**
 * 处理任务输入框的回车键
 * @param {KeyboardEvent} event - 键盘事件
 * @param {number} projectId - 项目ID
 */
function handleTaskInputKeypress(event, projectId) {
    if (event.key === 'Enter') {
        addTask(projectId);
    }
}

/**
 * 处理编辑项目名称时的回车键
 * @param {KeyboardEvent} event - 键盘事件
 * @param {number} projectId - 项目ID
 */
function handleEditProjectKeypress(event, projectId) {
    if (event.key === 'Enter') {
        saveProjectName(projectId);
    }
}

// ============================================================
// 表单验证事件监听器
// ============================================================

/**
 * 为项目表单附加验证事件监听器
 */
function attachProjectValidationListeners() {
    const fields = [
        'modalPlanStartDate',
        'modalPlanEndDate',
        'modalPlanDuration',
        'modalActualStartDate',
        'modalActualEndDate',
        'modalActualDuration'
    ];
    
    fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.removeEventListener('input', validateProjectTimeConsistency);
            el.addEventListener('input', validateProjectTimeConsistency);
        }
    });
}

/**
 * 为任务表单附加验证事件监听器
 */
function attachTaskValidationListeners() {
    const fields = [
        'modalTaskPlanStartDate',
        'modalTaskPlanEndDate',
        'modalTaskPlanDuration',
        'modalTaskActualStartDate',
        'modalTaskActualEndDate',
        'modalTaskActualDuration'
    ];
    
    fields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.removeEventListener('input', validateTaskTimeConsistency);
            el.addEventListener('input', validateTaskTimeConsistency);
        }
    });
}

// ============================================================
// 页面初始化
// ============================================================

// 页面加载完成后渲染项目列表
document.addEventListener('DOMContentLoaded', async function() {
    await renderProjects();
    setupRealtimeSubscription(); // 启动实时监听
});

// ============================================================
// 耗时选择器功能
// ============================================================

// 记录当前正在编辑的耗时字段ID
let currentDurationFieldId = null;
let selectedDurationHour = 0;
let selectedDurationMinute = 0;

/**
 * 打开耗时选择器
 * @param {string} fieldId - 要编辑的输入框ID
 */
function openDurationPicker(fieldId) {
    currentDurationFieldId = fieldId;
    
    // 解析当前值（如果有）
    const field = document.getElementById(fieldId);
    const currentValue = field.getAttribute('data-hours') || field.value;
    let initialHour = 0;
    let initialMinute = 0;
    
    if (currentValue) {
        const hours = parseFloat(currentValue);
        if (!isNaN(hours)) {
            initialHour = Math.floor(hours);
            initialMinute = Math.round((hours - initialHour) * 60 / 5) * 5; // 转换为5分钟倍数
        }
    }
    
    selectedDurationHour = initialHour;
    selectedDurationMinute = initialMinute;
    
    // 生成小时和分钟列表
    generateDurationHourPicker(initialHour);
    generateDurationMinutePicker(initialMinute);
    
    const modal = document.getElementById('durationPickerModal');
    modal.style.display = 'flex';
}

/**
 * 生成耗时小时选择器
 * @param {number} initialHour - 初始小时 0-12
 */
function generateDurationHourPicker(initialHour) {
    const container = document.getElementById('durationHourTable');
    container.innerHTML = '';
    
    for (let hour = 0; hour <= 12; hour++) {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.textContent = hour.toString();
        item.dataset.value = hour;
        
        if (hour === initialHour) {
            item.classList.add('selected');
        }
        
        item.addEventListener('click', () => {
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedDurationHour = hour;
        });
        
        container.appendChild(item);
    }
}

/**
 * 生成耗时分钟选择器
 * @param {number} initialMinute - 初始分钟 0-55
 */
function generateDurationMinutePicker(initialMinute) {
    const container = document.getElementById('durationMinuteTable');
    container.innerHTML = '';
    
    for (let minute = 0; minute < 60; minute += 5) {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.textContent = String(minute).padStart(2, '0');
        item.dataset.value = minute;
        
        if (minute === initialMinute) {
            item.classList.add('selected');
        }
        
        item.addEventListener('click', () => {
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedDurationMinute = minute;
        });
        
        container.appendChild(item);
    }
}

/**
 * 确认耗时选择
 */
function confirmDurationPicker() {
    if (!currentDurationFieldId) return;
    
    // 检查是否使用自定义输入
    const customInput = document.getElementById('customDurationInput');
    let totalHours;
    
    if (customInput.value) {
        totalHours = parseFloat(customInput.value);
        if (!totalHours || totalHours <= 0) {
            alert('请输入有效的耗时（大于0）');
            return;
        }
        customInput.value = ''; // 清空输入
    } else {
        // 计算总小时数（小时 + 分钟/60）
        totalHours = selectedDurationHour + selectedDurationMinute / 60;
        totalHours = Math.round(totalHours * 100) / 100; // 保留2位小数
    }
    
    // 设置值到对应的输入框
    const field = document.getElementById(currentDurationFieldId);
    if (field) {
        field.setAttribute('data-hours', totalHours); // 存储原始小时数
        field.value = formatDuration(totalHours); // 显示格式化文本
        
        // 触发自动保存
        if (currentDurationFieldId.startsWith('modalTask')) {
            autoSaveTask();
            updateTaskRelativeTimes();
        } else if (currentDurationFieldId.startsWith('modal')) {
            autoSaveProject();
            updateProjectRelativeTimes();
        }
    }
    
    closeDurationPicker();
}

/**
 * 关闭耗时选择器浮层
 */
function closeDurationPicker() {
    const modal = document.getElementById('durationPickerModal');
    modal.style.display = 'none';
    currentDurationFieldId = null;
    selectedDurationHour = 0;
    selectedDurationMinute = 0;
}

// ============================================================
// 赏金选择器
// ============================================================

let selectedBounty = 0;  // 当前选中的赏金

/**
 * 打开赏金选择器
 */
function openBountyPicker() {
    // 读取当前赏金值
    const bountyField = document.getElementById('modalTaskBounty');
    selectedBounty = parseFloat(bountyField.value) || 0;
    
    // 渲染赏金选项
    renderBountyOptions();
    
    // 显示赏金选择器
    document.getElementById('bountyPickerModal').style.display = 'flex';
}

/**
 * 关闭赏金选择器
 */
function closeBountyPicker() {
    document.getElementById('bountyPickerModal').style.display = 'none';
}

/**
 * 渲染赏金选项
 */
function renderBountyOptions() {
    const container = document.getElementById('bountyOptions');
    const bountyValues = [50, 100, 150, 200, 250, 300, 450, 500];
    
    container.innerHTML = bountyValues.map(value => `
        <div class="bounty-option ${selectedBounty === value ? 'selected' : ''}" 
             onclick="selectBounty(${value})">
            ${value}
        </div>
    `).join('');
}

/**
 * 选择赏金
 * @param {number} value - 赏金值
 */
function selectBounty(value) {
    selectedBounty = value;
    renderBountyOptions();
}

/**
 * 确认选择赏金
 */
function confirmBountyPicker() {
    // 检查是否使用自定义赏金
    const customInput = document.getElementById('customBountyInput');
    if (customInput.value) {
        selectedBounty = parseFloat(customInput.value) || 0;
    }
    
    // 设置赏金值到输入框
    const bountyField = document.getElementById('modalTaskBounty');
    bountyField.value = selectedBounty;
    
    // 触发自动保存
    autoSaveTask();
    
    // 清空自定义输入框
    customInput.value = '';
    
    // 关闭选择器
    closeBountyPicker();
}

// 创建防抖版本的自动保存函数（延迟1秒）
let debouncedAutoSaveProject = null;
let debouncedAutoSaveTask = null;

/**
 * 为项目表单绑定实时保存监听器
 */
function attachProjectAutoSaveListeners() {
    // 初始化防抖函数（如果还未初始化）
    if (!debouncedAutoSaveProject) {
        debouncedAutoSaveProject = debounce(autoSaveProject, 1000);
    }
    
    // 获取所有输入字段
    const fields = [
        'modalProjectName',
        'modalPlanStartDate',
        'modalPlanEndDate',
        'modalPlanDuration',
        'modalActualStartDate',
        'modalActualEndDate',
        'modalActualDuration',
        'modalPriority',
        'modalCategory',
        'modalBounty'
    ];
    
    // 为每个字段绑定change事件
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // 移除旧的监听器（防止重复绑定）
            field.removeEventListener('change', autoSaveProject);
            field.removeEventListener('input', autoSaveProject);
            field.removeEventListener('change', debouncedAutoSaveProject);
            field.removeEventListener('input', debouncedAutoSaveProject);
            
            // 添加新的监听器
            if (field.type === 'date' || field.tagName === 'SELECT') {
                // 日期和下拉选择使用防抖版本
                field.addEventListener('change', debouncedAutoSaveProject);
            } else if (field.type === 'text' && field.hasAttribute('readonly')) {
                // 对于只读的字段（如通过弹窗选择的），立即保存并更新相对时间
                field.addEventListener('change', () => {
                    autoSaveProject();
                    updateProjectRelativeTimes();
                });
            } else {
                // 文本和数字输入框使用防抖版本（避免每个字符都保存）
                field.addEventListener('input', debouncedAutoSaveProject);
            }
        }
    });
}

/**
 * 自动保存项目数据
 * 优化：直接更新数据库，不再先读取所有项目数据
 */
async function autoSaveProject() {
    if (!currentEditingProjectId) return;
    
    // 获取表单数据
    const name = document.getElementById('modalProjectName').value.trim();
    if (!name) return; // 名称为空不保存
    
    const planStartDate = document.getElementById('modalPlanStartDate').value;
    const planEndDate = document.getElementById('modalPlanEndDate').value;
    const planDurationField = document.getElementById('modalPlanDuration');
    const planDuration = parseFloat(planDurationField.getAttribute('data-hours') || planDurationField.value) || 0;
    const actualStartDate = document.getElementById('modalActualStartDate').value;
    const actualEndDate = document.getElementById('modalActualEndDate').value;
    const actualDurationField = document.getElementById('modalActualDuration');
    const actualDuration = parseFloat(actualDurationField.getAttribute('data-hours') || actualDurationField.value) || 0;
    const priority = document.getElementById('modalPriority').value;
    const category = document.getElementById('modalCategory').value;
    const bountyValue = document.getElementById('modalBounty').value;
    const bounty = bountyValue ? parseFloat(bountyValue) : 0;
    
    // 优化：直接更新数据库，而不是先读取所有项目
    try {
        const { error } = await supabaseClient
            .from('projects')
            .update({
                name,
                plan_start_date: planStartDate || null,
                plan_end_date: planEndDate || null,
                plan_duration: planDuration,
                actual_start_date: actualStartDate || null,
                actual_end_date: actualEndDate || null,
                actual_duration: actualDuration,
                priority,
                category,
                bounty
            })
            .eq('id', currentEditingProjectId);

        if (error) {
            console.error('Error auto-saving project:', error);
        }
        
        // 注意：由于有 Realtime 订阅，数据库变更会自动触发 renderProjects
        // 这里移除手动渲染，避免重复渲染导致的性能问题
    } catch (err) {
        console.error('Error in autoSaveProject:', err);
    }
    
    // 更新相对时间显示和验证状态（UI即时反馈）
    updateProjectRelativeTimes();
}

/**
 * 为任务表单绑定实时保存监听器
 */
function attachTaskAutoSaveListeners() {
    // 初始化防抖函数（如果还未初始化）
    if (!debouncedAutoSaveTask) {
        debouncedAutoSaveTask = debounce(autoSaveTask, 1000);
    }
    
    // 获取所有输入字段
    const fields = [
        'modalTaskName',
        'modalTaskPlanStartDate',
        'modalTaskPlanEndDate',
        'modalTaskPlanDuration',
        'modalTaskActualStartDate',
        'modalTaskActualEndDate',
        'modalTaskActualDuration',
        'modalTaskPriority',
        'modalTaskCategory',
        'modalTaskBounty',
        'modalTaskCompleted'
    ];
    
    // 为每个字段绑定change事件
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // 移除旧的监听器（防止重复绑定）
            field.removeEventListener('change', autoSaveTask);
            field.removeEventListener('input', autoSaveTask);
            field.removeEventListener('change', debouncedAutoSaveTask);
            field.removeEventListener('input', debouncedAutoSaveTask);
            
            // 添加新的监听器
            if (field.type === 'date' || field.tagName === 'SELECT') {
                // 日期和下拉选择使用防抖版本
                field.addEventListener('change', debouncedAutoSaveTask);
            } else if (field.type === 'text' && field.hasAttribute('readonly')) {
                // 对于只读的字段（如通过弹窗选择的），立即保存并更新相对时间
                field.addEventListener('change', () => {
                    autoSaveTask();
                    updateTaskRelativeTimes();
                });
            } else {
                // 文本和数字输入框使用防抖版本（避免每个字符都保存）
                field.addEventListener('input', debouncedAutoSaveTask);
            }
        }
    });
}

/**
 * 自动保存任务数据
 */
async function autoSaveTask() {
    if (!currentEditingTask.taskId) return;
    
    // 获取表单数据
    const name = document.getElementById('modalTaskName').value.trim();
    if (!name) return; // 名称为空不保存
    
    const planStartDate = document.getElementById('modalTaskPlanStartDate').value;
    const planEndDate = document.getElementById('modalTaskPlanEndDate').value;
    const planDurationField = document.getElementById('modalTaskPlanDuration');
    const planDuration = parseFloat(planDurationField.getAttribute('data-hours') || planDurationField.value) || 0;
    const actualStartDate = document.getElementById('modalTaskActualStartDate').value;
    const actualEndDate = document.getElementById('modalTaskActualEndDate').value;
    const actualDurationField = document.getElementById('modalTaskActualDuration');
    const actualDuration = parseFloat(actualDurationField.getAttribute('data-hours') || actualDurationField.value) || 0;
    const priority = document.getElementById('modalTaskPriority').value;
    const category = document.getElementById('modalTaskCategory').value;
    const bounty = parseFloat(document.getElementById('modalTaskBounty').value) || 0;
    const completed = document.getElementById('modalTaskCompleted').value === 'true';
    
    try {
        // 直接更新数据库中的任务
        const { error } = await supabaseClient
            .from('tasks')
            .update({
                name,
                plan_start_date: planStartDate || null,
                plan_end_date: planEndDate || null,
                plan_duration: planDuration,
                actual_start_date: actualStartDate || null,
                actual_end_date: actualEndDate || null,
                actual_duration: actualDuration,
                priority,
                category,
                bounty,
                completed
            })
            .eq('id', currentEditingTask.taskId);
        
        if (error) {
            console.error('Error saving task:', error);
            return;
        }
        
        // 移除手动渲染，依赖 Realtime 订阅更新
        // Supabase 的 Realtime 功能会自动触发 renderProjects 和 renderProjectDetailContent
        // 这里手动调用会导致重复渲染，影响性能
    } catch (err) {
        console.error('Error in autoSaveTask:', err);
    }
    
    // 更新相对时间显示和验证状态（UI即时反馈）
    updateTaskRelativeTimes();
}

// ============================================================
// 日期时间滚轮选择器功能
// ============================================================

// 记录当前正在编辑的日期时间字段ID
let currentDateTimeFieldId = null;
let selectedDate = null;
let selectedHour = null;
let selectedMinute = null;

/**
 * 打开日期时间滚轮选择器
 * @param {string} fieldId - 要编辑的输入框ID
 */
function openDateTimePicker(fieldId) {
    currentDateTimeFieldId = fieldId;
    
    // 解析当前值（如果有）
    const currentValue = document.getElementById(fieldId).value;
    let initialDate, initialHour, initialMinute;
    
    if (currentValue) {
        // 解析格式：YYYY-MM-DD HH:MM
        const parts = currentValue.split(' ');
        if (parts.length === 2) {
            initialDate = parts[0];
            const timeParts = parts[1].split(':');
            initialHour = parseInt(timeParts[0]);
            initialMinute = parseInt(timeParts[1]) || 0;
        }
    }
    
    // 如果没有当前值，使用今天和当前时间
    if (!initialDate) {
        const now = new Date();
        initialDate = now.toISOString().split('T')[0];
        initialHour = now.getHours();
        initialMinute = Math.floor(now.getMinutes() / 5) * 5; // 向下取整到5分钟
    }
    
    selectedDate = initialDate;
    selectedHour = initialHour;
    selectedMinute = initialMinute;
    
    // 生成滚轮内容
    generateDatePicker(initialDate);
    generateHourPicker(initialHour);
    generateMinutePicker(initialMinute);
    
    // 显示模态框
    document.getElementById('dateTimePickerModal').style.display = 'flex';
}

/**
 * 关闭日期时间滚轮选择器
 */
function closeDateTimePicker() {
    document.getElementById('dateTimePickerModal').style.display = 'none';
    currentDateTimeFieldId = null;
    selectedDate = null;
    selectedHour = null;
    selectedMinute = null;
}

/**
 * 确认选择日期时间
 */
function confirmDateTimePicker() {
    if (!currentDateTimeFieldId || !selectedDate || selectedHour === null || selectedMinute === null) return;
    
    // 格式化为 YYYY-MM-DD HH:MM
    const formattedValue = `${selectedDate} ${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
    
    // 设置值到输入框
    const field = document.getElementById(currentDateTimeFieldId);
    if (field) {
        field.value = formattedValue;
        
        // 触发自动保存
        if (currentDateTimeFieldId.startsWith('modalTask')) {
            autoSaveTask();
            updateTaskRelativeTimes();
        } else if (currentDateTimeFieldId.startsWith('modal')) {
            autoSaveProject();
            updateProjectRelativeTimes();
        }
    }
    
    closeDateTimePicker();
}

/**
 * 生成日期表格
 * @param {string} initialDate - 初始日期 YYYY-MM-DD
 */
function generateDatePicker(initialDate) {
    const container = document.getElementById('datePickerTable');
    container.innerHTML = '';
    
    // 生成过去5天到未来15天的日期
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = -10; i <= 20; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const displayStr = formatDateDisplay(date);
        dates.push({ value: dateStr, display: displayStr });
    }
    
    // 创建选项元素
    const todayStr = new Date().toISOString().split('T')[0]; // 获取今天日期字符串
    dates.forEach(date => {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.textContent = date.display;
        item.dataset.value = date.value;
        
        if (date.value === initialDate) {
            item.classList.add('selected');
        }
        
        // 如果是今天，添加current类
        if (date.value === todayStr) {
            item.classList.add('current');
        }
        
        item.addEventListener('click', () => {
            // 移除其他选中项
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedDate = date.value;
            updateDateRelativeDisplay(date.value);
        });
        
        container.appendChild(item);
    });
    
    // 初始化相对日期显示
    updateDateRelativeDisplay(initialDate);
}

/**
 * 生成小时表格
 * @param {number} initialHour - 初始小时 0-23
 */
function generateHourPicker(initialHour) {
    const container = document.getElementById('hourPickerTable');
    container.innerHTML = '';
    
    // 生成0-23小时
    const now = new Date();
    const currentHour = now.getHours();
    for (let hour = 0; hour < 24; hour++) {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.textContent = `${String(hour).padStart(2, '0')}`;
        item.dataset.value = hour;
        
        if (hour === initialHour) {
            item.classList.add('selected');
        }
        
        // 如果是当前小时，添加current类
        if (hour === currentHour) {
            item.classList.add('current');
        }
        
        item.addEventListener('click', () => {
            // 移除其他选中项
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedHour = hour;
            updateHourRelativeDisplay(hour);
        });
        
        container.appendChild(item);
    }
    
    // 初始化相对小时显示
    updateHourRelativeDisplay(initialHour);
}

/**
 * 格式化日期显示
 * @param {Date} date 
 * @returns {string}
 */
function formatDateDisplay(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[date.getDay()];
    
    return `${month}月${day}日 周${weekday}`;
}

/**
 * 更新相对日期显示
 * @param {string} dateStr - 日期字符串 YYYY-MM-DD
 */
function updateDateRelativeDisplay(dateStr) {
    const display = document.getElementById('dateRelativeDisplay');
    if (!display) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDateObj = new Date(dateStr);
    selectedDateObj.setHours(0, 0, 0, 0);
    
    const diffMs = selectedDateObj - today;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        display.textContent = '今天';
    } else if (diffDays === 1) {
        display.textContent = '明天';
    } else if (diffDays === -1) {
        display.textContent = '昨天';
    } else if (diffDays > 0) {
        display.textContent = `${diffDays}天后`;
    } else {
        display.textContent = `${Math.abs(diffDays)}天前`;
    }
}

/**
 * 更新相对小时显示
 * @param {number} hour - 小时 0-23
 */
function updateHourRelativeDisplay(hour) {
    const display = document.getElementById('hourRelativeDisplay');
    if (!display) return;
    
    const currentHour = new Date().getHours();
    const diffHours = hour - currentHour;
    
    if (diffHours === 0) {
        display.textContent = '当前时刻';
    } else if (diffHours > 0) {
        display.textContent = `${diffHours}小时后`;
    } else {
        display.textContent = `${Math.abs(diffHours)}小时前`;
    }
}

/**
 * 生成分钟表格
 * @param {number} initialMinute - 初始分钟 0-55
 */
function generateMinutePicker(initialMinute) {
    const container = document.getElementById('minutePickerTable');
    container.innerHTML = '';
    
    // 生成0, 5, 10, ..., 55分钟
    const now = new Date();
    const currentMinute = now.getMinutes();
    for (let minute = 0; minute < 60; minute += 5) {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.textContent = String(minute).padStart(2, '0');
        item.dataset.value = minute;
        
        if (minute === initialMinute) {
            item.classList.add('selected');
        }
        
        // 如果是当前分钟（±2分钟内），添加current类
        if (Math.abs(minute - currentMinute) <= 2) {
            item.classList.add('current');
        }
        
        item.addEventListener('click', () => {
            // 移除其他选中项
            container.querySelectorAll('.picker-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selectedMinute = minute;
            updateMinuteRelativeDisplay(minute);
        });
        
        container.appendChild(item);
    }
    
    // 初始化相对分钟显示
    updateMinuteRelativeDisplay(initialMinute);
}

/**
 * 更新相对分钟显示
 * @param {number} minute - 分钟 0-55
 */
function updateMinuteRelativeDisplay(minute) {
    const display = document.getElementById('minuteRelativeDisplay');
    if (!display) return;
    
    const currentMinute = new Date().getMinutes();
    const diffMinutes = minute - currentMinute;
    
    if (diffMinutes === 0) {
        display.textContent = '当前分钟';
    } else if (diffMinutes > 0) {
        display.textContent = `${diffMinutes}分钟后`;
    } else {
        display.textContent = `${Math.abs(diffMinutes)}分钟前`;
    }
}

/**
 * 更新任务表单中的相对时间显示
 */
function updateTaskRelativeTimes() {
    updateCombinedDateTime('modalTaskPlanStartDate', 'taskPlanStartRelative');
    updateCombinedDateTime('modalTaskPlanEndDate', 'taskPlanEndRelative');
    updateCombinedDateTime('modalTaskActualStartDate', 'taskActualStartRelative');
    updateCombinedDateTime('modalTaskActualEndDate', 'taskActualEndRelative');
    
    // 验证时间一致性
    validateTaskPlanTime();
    validateTaskActualTime();
}

/**
 * 更新项目表单中的相对时间显示
 */
function updateProjectRelativeTimes() {
    updateCombinedDateTime('modalPlanStartDate', 'projectPlanStartRelative');
    updateCombinedDateTime('modalPlanEndDate', 'projectPlanEndRelative');
    updateCombinedDateTime('modalActualStartDate', 'projectActualStartRelative');
    updateCombinedDateTime('modalActualEndDate', 'projectActualEndRelative');
    
    // 验证时间一致性
    validateProjectPlanTime();
    validateProjectActualTime();
}

/**
 * 更新单个日期时间的合并相对显示
 * @param {string} fieldId - 输入框ID
 * @param {string} boxId - 显示框ID
 */
function updateCombinedDateTime(fieldId, boxId) {
    const field = document.getElementById(fieldId);
    const box = document.getElementById(boxId);
    
    if (!field || !box) return;
    
    const rawValue = field.value;
    if (!rawValue) {
        box.textContent = '-';
        return;
    }
    
    // 兼容不同格式："YYYY-MM-DD HH:MM"、"YYYY-MM-DDTHH:MM:SSZ"、仅日期
    let normalized = rawValue.replace('T', ' ').replace('Z', '').trim();
    // 去掉时区偏移（+08:00）等，只保留日期和时间部分
    if (normalized.includes('+')) {
        normalized = normalized.split('+')[0].trim();
    }
    if (!normalized.includes(' ')) {
        normalized = `${normalized} 00:00`;
    }
    const parts = normalized.split(' ');
    if (parts.length < 2) {
        box.textContent = '-';
        return;
    }
    const dateStr = parts[0];
    const timeParts = parts[1].split(':');
    const hour = parseInt(timeParts[0] || '0', 10);
    const minute = parseInt(timeParts[1] || '0', 10);
    
    // 计算天数差
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(dateStr);
    selectedDate.setHours(0, 0, 0, 0);
    
    const diffMs = selectedDate - today;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    
    let dayText = '';
    if (diffDays === 0) {
        dayText = '今天';
    } else if (diffDays === 1) {
        dayText = '明天';
    } else if (diffDays === -1) {
        dayText = '昨天';
    } else if (diffDays > 0) {
        dayText = `${diffDays}天后`;
    } else {
        dayText = `${Math.abs(diffDays)}天前`;
    }
    
    // 计算小时和分钟差（基于当前时间）
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const diffHours = hour - currentHour;
    const diffMinutes = minute - currentMinute;
    
    let hourText = '';
    if (diffHours === 0) {
        hourText = '此刻';
    } else if (diffHours > 0) {
        hourText = `${diffHours}小时后`;
    } else {
        hourText = `${Math.abs(diffHours)}小时前`;
    }
    
    let minuteText = '';
    if (diffMinutes !== 0) {
        if (diffMinutes > 0) {
            minuteText = `${diffMinutes}分钟后`;
        } else {
            minuteText = `${Math.abs(diffMinutes)}分钟前`;
        }
    }
    
    // 合并显示
    if (minuteText) {
        box.textContent = `${dayText} ${hourText} ${minuteText}`;
    } else {
        box.textContent = `${dayText} ${hourText}`;
    }
}

// =============================================
// 时间一致性验证和修正功能
// =============================================

// 验证项目预计时间
function validateProjectPlanTime() {
    const startVal = document.getElementById('modalPlanStartDate').value;
    const durationField = document.getElementById('modalPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    const endVal = document.getElementById('modalPlanEndDate').value;
    
    validateTimeConsistency('fixProjectPlanStart', 'fixProjectPlanDuration', 'fixProjectPlanEnd', startVal, durationVal, endVal);
}

// 验证项目实际时间
function validateProjectActualTime() {
    const startVal = document.getElementById('modalActualStartDate').value;
    const durationField = document.getElementById('modalActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    const endVal = document.getElementById('modalActualEndDate').value;
    
    validateTimeConsistency('fixProjectActualStart', 'fixProjectActualDuration', 'fixProjectActualEnd', startVal, durationVal, endVal);
}

// 验证任务预计时间
function validateTaskPlanTime() {
    const startVal = document.getElementById('modalTaskPlanStartDate').value;
    const durationField = document.getElementById('modalTaskPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    const endVal = document.getElementById('modalTaskPlanEndDate').value;
    
    validateTimeConsistency('fixTaskPlanStart', 'fixTaskPlanDuration', 'fixTaskPlanEnd', startVal, durationVal, endVal);
}

// 验证任务实际时间
function validateTaskActualTime() {
    const startVal = document.getElementById('modalTaskActualStartDate').value;
    const durationField = document.getElementById('modalTaskActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    const endVal = document.getElementById('modalTaskActualEndDate').value;
    
    validateTimeConsistency('fixTaskActualStart', 'fixTaskActualDuration', 'fixTaskActualEnd', startVal, durationVal, endVal);
}

// 通用验证逻辑
function validateTimeConsistency(startBtnId, durationBtnId, endBtnId, startVal, durationVal, endVal) {
    const startBtn = document.getElementById(startBtnId);
    const durationBtn = document.getElementById(durationBtnId);
    const endBtn = document.getElementById(endBtnId);
    
    // 如果任何字段为空，禁用所有按钮
    if (!startVal || !durationVal || !endVal) {
        startBtn.disabled = true;
        durationBtn.disabled = true;
        endBtn.disabled = true;
        return;
    }
    
    // 解析时间
    const startDate = new Date(startVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const endDate = new Date(endVal.replace(' ', 'T'));
    
    // 计算预期结束时间
    const expectedEnd = new Date(startDate.getTime() + duration * 3600000);
    
    // 比较时间（容差30秒，基本等于完全一致）
    const timeDiff = Math.abs(expectedEnd - endDate);
    const isConsistent = timeDiff <= 30000; // 30秒 = 30000毫秒
    
    // 根据是否一致来启用/禁用按钮
    startBtn.disabled = isConsistent;
    durationBtn.disabled = isConsistent;
    endBtn.disabled = isConsistent;
}

// 修正项目预计开始时间
function fixProjectPlanStart() {
    const endVal = document.getElementById('modalPlanEndDate').value;
    const durationField = document.getElementById('modalPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!endVal || !durationVal) return;
    
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const startDate = new Date(endDate.getTime() - duration * 3600000);
    
    const formatted = formatDateForInput(startDate);
    document.getElementById('modalPlanStartDate').value = formatted;
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正项目预计耗时
function fixProjectPlanDuration() {
    const startVal = document.getElementById('modalPlanStartDate').value;
    const endVal = document.getElementById('modalPlanEndDate').value;
    
    if (!startVal || !endVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = Math.round((endDate - startDate) / 3600000 * 100) / 100; // 保留2位小数
    
    const field = document.getElementById('modalPlanDuration');
    const finalDuration = duration > 0 ? duration : 0;
    field.setAttribute('data-hours', finalDuration);
    field.value = formatDuration(finalDuration);
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正项目预计结束时间
function fixProjectPlanEnd() {
    const startVal = document.getElementById('modalPlanStartDate').value;
    const durationField = document.getElementById('modalPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!startVal || !durationVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const endDate = new Date(startDate.getTime() + duration * 3600000);
    
    const formatted = formatDateForInput(endDate);
    document.getElementById('modalPlanEndDate').value = formatted;
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正项目实际开始时间
function fixProjectActualStart() {
    const endVal = document.getElementById('modalActualEndDate').value;
    const durationField = document.getElementById('modalActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!endVal || !durationVal) return;
    
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const startDate = new Date(endDate.getTime() - duration * 3600000);
    
    const formatted = formatDateForInput(startDate);
    document.getElementById('modalActualStartDate').value = formatted;
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正项目实际耗时
function fixProjectActualDuration() {
    const startVal = document.getElementById('modalActualStartDate').value;
    const endVal = document.getElementById('modalActualEndDate').value;
    
    if (!startVal || !endVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = Math.round((endDate - startDate) / 3600000 * 100) / 100; // 保留2位小数
    
    const field = document.getElementById('modalActualDuration');
    const finalDuration = duration > 0 ? duration : 0;
    field.setAttribute('data-hours', finalDuration);
    field.value = formatDuration(finalDuration);
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正项目实际结束时间
function fixProjectActualEnd() {
    const startVal = document.getElementById('modalActualStartDate').value;
    const durationField = document.getElementById('modalActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!startVal || !durationVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const endDate = new Date(startDate.getTime() + duration * 3600000);
    
    const formatted = formatDateForInput(endDate);
    document.getElementById('modalActualEndDate').value = formatted;
    
    autoSaveProject();
    updateProjectRelativeTimes();
}

// 修正任务预计开始时间
function fixTaskPlanStart() {
    const endVal = document.getElementById('modalTaskPlanEndDate').value;
    const durationField = document.getElementById('modalTaskPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!endVal || !durationVal) return;
    
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const startDate = new Date(endDate.getTime() - duration * 3600000);
    
    const formatted = formatDateForInput(startDate);
    document.getElementById('modalTaskPlanStartDate').value = formatted;
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 修正任务预计耗时
function fixTaskPlanDuration() {
    const startVal = document.getElementById('modalTaskPlanStartDate').value;
    const endVal = document.getElementById('modalTaskPlanEndDate').value;
    
    if (!startVal || !endVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = Math.round((endDate - startDate) / 3600000 * 100) / 100; // 保留2位小数
    
    const field = document.getElementById('modalTaskPlanDuration');
    const finalDuration = duration > 0 ? duration : 0;
    field.setAttribute('data-hours', finalDuration);
    field.value = formatDuration(finalDuration);
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 修正任务预计结束时间
function fixTaskPlanEnd() {
    const startVal = document.getElementById('modalTaskPlanStartDate').value;
    const durationField = document.getElementById('modalTaskPlanDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!startVal || !durationVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const endDate = new Date(startDate.getTime() + duration * 3600000);
    
    const formatted = formatDateForInput(endDate);
    document.getElementById('modalTaskPlanEndDate').value = formatted;
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 修正任务实际开始时间
function fixTaskActualStart() {
    const endVal = document.getElementById('modalTaskActualEndDate').value;
    const durationField = document.getElementById('modalTaskActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!endVal || !durationVal) return;
    
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const startDate = new Date(endDate.getTime() - duration * 3600000);
    
    const formatted = formatDateForInput(startDate);
    document.getElementById('modalTaskActualStartDate').value = formatted;
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 修正任务实际耗时
function fixTaskActualDuration() {
    const startVal = document.getElementById('modalTaskActualStartDate').value;
    const endVal = document.getElementById('modalTaskActualEndDate').value;
    
    if (!startVal || !endVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const endDate = new Date(endVal.replace(' ', 'T'));
    const duration = Math.round((endDate - startDate) / 3600000 * 100) / 100; // 保留2位小数
    
    const field = document.getElementById('modalTaskActualDuration');
    const finalDuration = duration > 0 ? duration : 0;
    field.setAttribute('data-hours', finalDuration);
    field.value = formatDuration(finalDuration);
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 修正任务实际结束时间
function fixTaskActualEnd() {
    const startVal = document.getElementById('modalTaskActualStartDate').value;
    const durationField = document.getElementById('modalTaskActualDuration');
    const durationVal = durationField.getAttribute('data-hours') || durationField.value;
    
    if (!startVal || !durationVal) return;
    
    const startDate = new Date(startVal.replace(' ', 'T'));
    const duration = parseFloat(durationVal);
    const endDate = new Date(startDate.getTime() + duration * 3600000);
    
    const formatted = formatDateForInput(endDate);
    document.getElementById('modalTaskActualEndDate').value = formatted;
    
    autoSaveTask();
    updateTaskRelativeTimes();
}

// 格式化日期为输入框格式
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(Math.floor(date.getMinutes() / 5) * 5).padStart(2, '0'); // 向下取整到5分钟
    return `${year}-${month}-${day} ${hour}:${minute}`;
}

// 格式化耗时显示为"x小时x分钟"
function formatDuration(hours) {
    if (!hours || hours === 0) return '0小时';
    
    const totalHours = parseFloat(hours);
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    
    if (h === 0) {
        return `${m}分钟`;
    } else if (m === 0) {
        return `${h}小时`;
    } else {
        return `${h}小时${m}分钟`;
    }
}

// ============================================================
//  任务依赖关系管理
// ============================================================

/**
 * 打开任务关联设置浮层
 */
async function openTaskDependencyModal() {
    // 保存当前编辑的任务信息
    const taskNameField = document.getElementById('modalTaskName');
    if (taskNameField && taskNameField.dataset.taskId) {
        currentEditingTaskId = parseInt(taskNameField.dataset.taskId);
        currentEditingTaskProjectId = parseInt(taskNameField.dataset.projectId);
    } else {
        alert('无法获取任务信息，请重新打开任务编辑页面');
        return;
    }
    
    // 获取最新的项目数据
    const projectsData = await getProjects();
    
    // 获取当前任务已有的前置任务
    if (currentEditingTaskId && currentEditingTaskProjectId) {
        const project = projectsData.find(p => p.id === currentEditingTaskProjectId);
        if (project) {
            const task = project.tasks.find(t => t.id === currentEditingTaskId);
            if (task && task.prerequisites) {
                selectedPrerequisites = [...task.prerequisites];
            } else {
                selectedPrerequisites = [];
            }
        }
    } else {
        selectedPrerequisites = [];
    }
    
    // 更新显示框
    await updatePrerequisitesDisplay();
    
    // 显示任务关联设置浮层
    document.getElementById('taskDependencyModal').style.display = 'flex';
}

/**
 * 关闭任务关联设置浮层
 */
function closeTaskDependencyModal() {
    document.getElementById('taskDependencyModal').style.display = 'none';
}

/**
 * 打开前置任务选择器
 */
async function openPrerequisiteSelector() {
    if (!currentEditingTaskProjectId) {
        alert('无法获取项目信息');
        return;
    }
    
    // 获取最新的项目数据
    const projectsData = await getProjects();
    const project = projectsData.find(p => p.id === currentEditingTaskProjectId);
    if (!project) {
        alert('项目不存在');
        return;
    }
    
    // 渲染任务列表（排除当前任务）
    const listContainer = document.getElementById('prerequisiteTaskList');
    const otherTasks = project.tasks.filter(t => t.id !== currentEditingTaskId);
    
    if (otherTasks.length === 0) {
        listContainer.innerHTML = '<div class="task-empty">暂无其他任务</div>';
    } else {
        listContainer.innerHTML = otherTasks.map(task => `
            <label class="prerequisite-item">
                <input 
                    type="checkbox" 
                    value="${task.id}"
                    ${selectedPrerequisites.includes(task.id) ? 'checked' : ''}
                    onchange="togglePrerequisite(${task.id}, this.checked)"
                >
                <span class="task-name ${task.completed ? 'completed' : ''}">
                    ${escapeHtml(task.name)}
                </span>
                ${task.completed ? '<span class="task-status">✅ 已完成</span>' : '<span class="task-status">⏳ 进行中</span>'}
            </label>
        `).join('');
    }
    
    // 显示前置任务选择器
    document.getElementById('prerequisiteSelectorModal').style.display = 'flex';
}

/**
 * 关闭前置任务选择器
 */
function closePrerequisiteSelector() {
    document.getElementById('prerequisiteSelectorModal').style.display = 'none';
}

/**
 * 切换前置任务选择
 * @param {number} taskId 
 * @param {boolean} checked 
 */
function togglePrerequisite(taskId, checked) {
    if (checked) {
        if (!selectedPrerequisites.includes(taskId)) {
            selectedPrerequisites.push(taskId);
        }
    } else {
        selectedPrerequisites = selectedPrerequisites.filter(id => id !== taskId);
    }
}

/**
 * 确认前置任务选择
 */
function confirmPrerequisiteSelection() {
    // 更新显示框
    updatePrerequisitesDisplay();
    
    // 关闭选择器
    closePrerequisiteSelector();
}

/**
 * 更新已选择的前置任务显示框
 */
async function updatePrerequisitesDisplay() {
    const displayContainer = document.getElementById('selectedPrerequisitesDisplay');
    const displayInput = document.getElementById('taskDependencyDisplay');
    
    if (!displayContainer) {
        console.error('selectedPrerequisitesDisplay not found');
        return;
    }
    
    if (!selectedPrerequisites || selectedPrerequisites.length === 0) {
        displayContainer.innerHTML = '<span class="empty-hint">暂无前置任务</span>';
        if (displayInput) {
            displayInput.value = '';
        }
        return;
    }
    
    // 获取最新的项目数据
    const projectsData = await getProjects();
    if (!projectsData || projectsData.length === 0) {
        displayContainer.innerHTML = '<span class="empty-hint">加载中...</span>';
        if (displayInput) {
            displayInput.value = '';
        }
        return;
    }
    
    // 获取任务信息
    const project = projectsData.find(p => p.id === currentEditingTaskProjectId);
    if (!project) {
        console.error('Project not found:', currentEditingTaskProjectId);
        displayContainer.innerHTML = '<span class="empty-hint">项目不存在</span>';
        if (displayInput) {
            displayInput.value = '';
        }
        return;
    }
    
    const prerequisiteTasks = selectedPrerequisites
        .map(id => project.tasks.find(t => t.id === id))
        .filter(t => t); // 过滤掉不存在的任务
    
    if (prerequisiteTasks.length === 0) {
        displayContainer.innerHTML = '<span class="empty-hint">前置任务不存在</span>';
        if (displayInput) {
            displayInput.value = '';
        }
        return;
    }
    
    // 更新弹窗内的显示
    displayContainer.innerHTML = prerequisiteTasks.map(task => `
        <div class="prerequisite-tag">
            <span>${escapeHtml(task.name)}</span>
            <span class="remove-btn" onclick="removePrerequisite(${task.id})">✕</span>
        </div>
    `).join('');
    
    // 更新主表单的input显示
    if (displayInput) {
        const taskNames = prerequisiteTasks.map(t => t.name).join('.');
        displayInput.value = `[${taskNames}]`;
    }
}

/**
 * 移除前置任务
 * @param {number} taskId 
 */
function removePrerequisite(taskId) {
    selectedPrerequisites = selectedPrerequisites.filter(id => id !== taskId);
    updatePrerequisitesDisplay();
}

/**
 * 确认任务关联设置
 */
async function confirmTaskDependency() {
    if (!currentEditingTaskId || !currentEditingTaskProjectId) {
        alert('无法保存任务关联');
        return;
    }
    
    try {
        // 保存到数据库
        const { error } = await supabaseClient
            .from('tasks')
            .update({
                prerequisites: selectedPrerequisites
            })
            .eq('id', currentEditingTaskId);
        
        if (error) {
            console.error('Error updating task prerequisites:', error);
            alert('保存失败，请重试');
            return;
        }
        
        // 刷新界面
        await renderProjects();
        if (currentDetailProjectId) {
            await renderProjectDetailContent();
        }
        
        // 关闭浮层
        closeTaskDependencyModal();
    } catch (err) {
        console.error('Error in confirmTaskDependency:', err);
        alert('保存失败，请重试');
    }
}

// ============================================================
//  任务关系图（力导向图）
// ============================================================

let taskGraphSimulation = null;  // D3 力模拟对象

/**
 * 渲染任务关系图
 * @param {Array} tasks - 任务列表
 */
function renderTaskGraph(tasks) {
    const container = document.getElementById('taskGraphContainer');
    const svg = d3.select('#taskGraphSvg');
    
    // 清空现有内容
    svg.selectAll('*').remove();
    
    // 如果没有任务，显示空提示
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="task-graph-empty">暂无任务</div>';
        return;
    }
    
    // 恢复SVG
    if (!document.getElementById('taskGraphSvg')) {
        container.innerHTML = '<svg id="taskGraphSvg"></svg>';
    }
    
    // 获取容器尺寸
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 300;
    
    // 设置SVG尺寸
    svg.attr('width', width).attr('height', height);
    
    // 构建节点数据
    const nodes = tasks.map(task => ({
        id: task.id,
        name: task.name,
        completed: task.completed,
        prerequisites: task.prerequisites || []
    }));
    
    // 构建连接数据（从前置任务指向当前任务）
    const links = [];
    tasks.forEach(task => {
        if (task.prerequisites && task.prerequisites.length > 0) {
            task.prerequisites.forEach(prereqId => {
                // 确保前置任务存在于当前任务列表中
                if (nodes.find(n => n.id === prereqId)) {
                    links.push({
                        source: prereqId,
                        target: task.id
                    });
                }
            });
        }
    });
    
    // 创建箭头标记
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'rgba(102, 255, 204, 0.6)');
    
    // 创建力模拟
    taskGraphSimulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.5))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(35));
    
    // 绘制连接线
    const link = svg.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'task-link')
        .attr('marker-end', 'url(#arrowhead)');
    
    // 创建节点组
    const node = svg.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', d => `task-node ${d.completed ? 'completed' : ''}`)
        .call(d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded));
    
    // 添加圆形节点
    node.append('circle')
        .attr('r', 20);
    
    // 添加任务名称
    node.append('text')
        .attr('dy', 4)
        .text(d => truncateName(d.name, 6));
    
    // 添加悬停提示
    node.append('title')
        .text(d => d.name);
    
    // 力模拟更新
    taskGraphSimulation.on('tick', () => {
        // 限制节点在边界内
        nodes.forEach(d => {
            d.x = Math.max(25, Math.min(width - 25, d.x));
            d.y = Math.max(25, Math.min(height - 25, d.y));
        });
        
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
    
    // 鼠标悬停效果：高亮相关连接
    node.on('mouseenter', function(event, d) {
        // 高亮与此节点相关的连接线
        link.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id);
    }).on('mouseleave', function() {
        link.classed('highlighted', false);
    });
    
    // 双击节点打开任务编辑页面
    node.on('dblclick', function(event, d) {
        event.stopPropagation();  // 阻止事件冒泡
        openEditTaskModal(currentDetailProjectId, d.id);
    });
}

/**
 * 截断名称
 * @param {string} name 
 * @param {number} maxLen 
 */
function truncateName(name, maxLen) {
    if (!name) return '';
    return name.length > maxLen ? name.substring(0, maxLen) + '..' : name;
}

/**
 * 拖拽开始
 */
function dragStarted(event, d) {
    if (!event.active) taskGraphSimulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
    
    // 添加拖拽样式
    d3.select(this).classed('dragging', true);
    
    // 获取关联的节点ID
    const relatedIds = getRelatedNodeIds(d.id);
    
    // 存储关联节点的初始偏移量
    d._relatedOffsets = {};
    const nodes = taskGraphSimulation.nodes();
    relatedIds.forEach(id => {
        const relatedNode = nodes.find(n => n.id === id);
        if (relatedNode && relatedNode.id !== d.id) {
            d._relatedOffsets[id] = {
                dx: relatedNode.x - d.x,
                dy: relatedNode.y - d.y
            };
        }
    });
}

/**
 * 拖拽中
 */
function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    
    // 拖动关联的节点（带弹性效果）
    const nodes = taskGraphSimulation.nodes();
    if (d._relatedOffsets) {
        Object.entries(d._relatedOffsets).forEach(([id, offset]) => {
            const relatedNode = nodes.find(n => n.id === parseInt(id));
            if (relatedNode) {
                // 使用弹性系数让关联节点跟随但有延迟
                const elasticity = 0.3;
                const targetX = event.x + offset.dx;
                const targetY = event.y + offset.dy;
                relatedNode.fx = relatedNode.x + (targetX - relatedNode.x) * elasticity;
                relatedNode.fy = relatedNode.y + (targetY - relatedNode.y) * elasticity;
            }
        });
    }
}

/**
 * 拖拽结束
 */
function dragEnded(event, d) {
    if (!event.active) taskGraphSimulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
    
    // 移除拖拽样式
    d3.select(this).classed('dragging', false);
    
    // 释放关联节点的固定位置
    const nodes = taskGraphSimulation.nodes();
    if (d._relatedOffsets) {
        Object.keys(d._relatedOffsets).forEach(id => {
            const relatedNode = nodes.find(n => n.id === parseInt(id));
            if (relatedNode) {
                relatedNode.fx = null;
                relatedNode.fy = null;
            }
        });
        delete d._relatedOffsets;
    }
}

/**
 * 获取与指定节点关联的所有节点ID（包括前置和后续任务）
 * @param {number} nodeId 
 * @returns {Set} 关联节点ID集合
 */
function getRelatedNodeIds(nodeId) {
    const nodes = taskGraphSimulation.nodes();
    const related = new Set();
    
    // 查找所有直接关联的节点
    nodes.forEach(node => {
        // 当前节点的前置任务
        if (node.id === nodeId && node.prerequisites) {
            node.prerequisites.forEach(id => related.add(id));
        }
        // 以当前节点为前置任务的节点
        if (node.prerequisites && node.prerequisites.includes(nodeId)) {
            related.add(node.id);
        }
    });
    
    return related;
}

// ============================================================
//  重要度/紧急度矩阵选择器
// ============================================================

let selectedImportance = 0;  // -1 到 1
let selectedUrgency = 0;     // -1 到 1

/**
 * 打开重要度/紧急度矩阵选择器
 */
function openPriorityMatrix() {
    // 读取当前值
    const priorityField = document.getElementById('modalTaskPriority');
    if (priorityField && priorityField.value) {
        try {
            const data = JSON.parse(priorityField.value);
            selectedImportance = data.importance || 0;
            selectedUrgency = data.urgency || 0;
        } catch (e) {
            // 兼容旧数据格式（低/中/高）
            const oldValue = priorityField.value;
            if (oldValue === '低') {
                selectedImportance = -0.5;
                selectedUrgency = -0.5;
            } else if (oldValue === '中') {
                selectedImportance = 0;
                selectedUrgency = 0;
            } else if (oldValue === '高') {
                selectedImportance = 0.5;
                selectedUrgency = 0.5;
            }
        }
    }
    
    // 渲染坐标系
    renderPriorityMatrix();
    
    // 显示浮层
    document.getElementById('priorityMatrixModal').style.display = 'flex';
}

/**
 * 关闭重要度/紧急度矩阵选择器
 */
function closePriorityMatrix() {
    document.getElementById('priorityMatrixModal').style.display = 'none';
}

/**
 * 渲染重要度/紧急度矩阵
 */
function renderPriorityMatrix() {
    const svg = d3.select('#priorityMatrixSvg');
    svg.selectAll('*').remove();
    
    const container = document.querySelector('.priority-matrix-container');
    const width = container.clientWidth || 500;
    const height = container.clientHeight || 500;
    const padding = 50;
    const size = Math.min(width, height) - padding * 2;
    
    svg.attr('width', width).attr('height', height);
    
    // 坐标原点在中心
    const originX = width / 2;
    const originY = height / 2;
    const scale = size / 2;  // -1到1映射到坐标系
    
    // 绘制网格线
    const gridLines = [-0.5, 0.5];
    gridLines.forEach(val => {
        // 垂直线
        svg.append('line')
            .attr('class', 'priority-grid')
            .attr('x1', originX + val * scale)
            .attr('y1', originY - scale)
            .attr('x2', originX + val * scale)
            .attr('y2', originY + scale);
        
        // 水平线
        svg.append('line')
            .attr('class', 'priority-grid')
            .attr('x1', originX - scale)
            .attr('y1', originY - val * scale)
            .attr('x2', originX + scale)
            .attr('y2', originY - val * scale);
    });
    
    // 绘制X轴（紧急度）
    svg.append('line')
        .attr('class', 'priority-axis')
        .attr('x1', originX - scale)
        .attr('y1', originY)
        .attr('x2', originX + scale)
        .attr('y2', originY);
    
    // X轴箭头
    svg.append('polygon')
        .attr('class', 'priority-axis-arrow')
        .attr('points', `${originX + scale},${originY} ${originX + scale - 8},${originY - 4} ${originX + scale - 8},${originY + 4}`);
    
    // 绘制Y轴（重要度）
    svg.append('line')
        .attr('class', 'priority-axis')
        .attr('x1', originX)
        .attr('y1', originY - scale)
        .attr('x2', originX)
        .attr('y2', originY + scale);
    
    // Y轴箭头
    svg.append('polygon')
        .attr('class', 'priority-axis-arrow')
        .attr('points', `${originX},${originY - scale} ${originX - 4},${originY - scale + 8} ${originX + 4},${originY - scale + 8}`);
    
    // 添加轴标签
    svg.append('text')
        .attr('class', 'priority-label')
        .attr('x', originX + scale + 15)
        .attr('y', originY + 5)
        .text('紧急→');
    
    svg.append('text')
        .attr('class', 'priority-label')
        .attr('x', originX - 5)
        .attr('y', originY - scale - 10)
        .attr('text-anchor', 'middle')
        .text('↑重要');
    
    // 绘制当前选中的点
    updatePriorityPoint(originX, originY, scale);
    
    // 点击坐标系选择位置
    svg.append('rect')
        .attr('x', originX - scale)
        .attr('y', originY - scale)
        .attr('width', scale * 2)
        .attr('height', scale * 2)
        .attr('fill', 'transparent')
        .on('click', function(event) {
            const [mouseX, mouseY] = d3.pointer(event);
            
            // 转换为-1到1的坐标
            selectedUrgency = Math.max(-1, Math.min(1, (mouseX - originX) / scale));
            selectedImportance = Math.max(-1, Math.min(1, (originY - mouseY) / scale));
            
            // 保留2位小数
            selectedUrgency = Math.round(selectedUrgency * 100) / 100;
            selectedImportance = Math.round(selectedImportance * 100) / 100;
            
            // 更新显示
            updatePriorityPoint(originX, originY, scale);
        });
}

/**
 * 更新选中点的显示
 */
function updatePriorityPoint(originX, originY, scale) {
    const svg = d3.select('#priorityMatrixSvg');
    
    // 移除旧的点
    svg.selectAll('.priority-point').remove();
    svg.selectAll('.priority-point-label').remove();
    
    // 计算点的位置
    const pointX = originX + selectedUrgency * scale;
    const pointY = originY - selectedImportance * scale;
    
    // 绘制新的点
    svg.append('circle')
        .attr('class', 'priority-point')
        .attr('cx', pointX)
        .attr('cy', pointY)
        .attr('r', 8);
    
    // 绘制点上的文字（分两行）
    const importanceLabel = selectedImportance >= 0 ? `重要 ${selectedImportance.toFixed(1)}` : `不重要 ${Math.abs(selectedImportance).toFixed(1)}`;
    const urgencyLabel = selectedUrgency >= 0 ? `紧急 ${selectedUrgency.toFixed(1)}` : `不紧急 ${Math.abs(selectedUrgency).toFixed(1)}`;
    
    svg.append('text')
        .attr('class', 'priority-point-label')
        .attr('x', pointX)
        .attr('y', pointY - 15)
        .text(importanceLabel);
    
    svg.append('text')
        .attr('class', 'priority-point-label')
        .attr('x', pointX)
        .attr('y', pointY - 3)
        .text(urgencyLabel);
    
    // 更新信息框
    updatePriorityInfoBox();
}

/**
 * 更新信息显示框
 */
function updatePriorityInfoBox() {
    const infoBox = document.getElementById('priorityInfoBox');
    
    const importanceLabel = selectedImportance >= 0 ? `重要 ${selectedImportance.toFixed(1)}` : `不重要 ${Math.abs(selectedImportance).toFixed(1)}`;
    const urgencyLabel = selectedUrgency >= 0 ? `紧急 ${selectedUrgency.toFixed(1)}` : `不紧急 ${Math.abs(selectedUrgency).toFixed(1)}`;
    
    infoBox.innerHTML = `
        <div style="line-height: 1.8;">
            <div>${importanceLabel}</div>
            <div>${urgencyLabel}</div>
        </div>
    `;
}

/**
 * 确认选择
 */
function confirmPriorityMatrix() {
    // 保存到隐藏字段
    const priorityField = document.getElementById('modalTaskPriority');
    const data = {
        importance: selectedImportance,
        urgency: selectedUrgency
    };
    priorityField.value = JSON.stringify(data);
    
    // 更新按钮显示
    updatePriorityButtonDisplay();
    
    // 触发自动保存（如果在编辑模式）
    if (currentEditingTask.taskId) {
        autoSaveTask();
    }
    
    // 关闭浮层
    closePriorityMatrix();
}

/**
 * 更新优先级按钮显示文字
 */
function updatePriorityButtonDisplay() {
    const priorityField = document.getElementById('modalTaskPriority');
    const displayInput = document.getElementById('priorityMatrixDisplay');
    
    if (!priorityField || !displayInput) return;
    
    try {
        let data;
        const fieldValue = priorityField.value;
        
        // 处理对象类型和字符串类型
        if (typeof fieldValue === 'object') {
            data = fieldValue;
        } else {
            data = JSON.parse(fieldValue);
        }
        
        const importance = data.importance || 0;
        const urgency = data.urgency || 0;
        
        displayInput.value = `重要${importance.toFixed(1)}/紧急${urgency.toFixed(1)}`;
    } catch (e) {
        console.error('Error parsing priority:', e);
        displayInput.value = '';
    }
}


