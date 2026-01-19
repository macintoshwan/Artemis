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
 *     actualStartDate: "",      // 实际开始时间
 *     actualEndDate: "",        // 实际结束时间
 *     priority: "中",           // 重要度：低/中/高
 *     category: "工作",         // 类别：工作/学习/生活/其他
 *     bounty: 0,                // 赏金
 *     tasks: [                   // 任务数组
 *       {
 *         id: 1234567891,        // 任务唯一ID（时间戳）
 *         name: "任务名称",       // 任务名称
 *         planStartDate: "",     // 预计开始时间
 *         planEndDate: "",       // 预计结束时间
 *         actualStartDate: "",   // 实际开始时间
 *         actualEndDate: "",     // 实际结束时间
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
// 配置常量
// ============================================================

// localStorage 存储的键名
const STORAGE_KEY = 'projectManagerData';

// ============================================================
// 数据操作函数 - 读取和保存
// ============================================================

/**
 * 从 localStorage 读取所有项目数据
 * @returns {Array} 项目数组，如果没有数据则返回空数组
 */
function getProjects() {
    // 从 localStorage 获取 JSON 字符串
    const data = localStorage.getItem(STORAGE_KEY);
    // 如果有数据，解析为对象；否则返回空数组
    return data ? JSON.parse(data) : [];
}

/**
 * 将项目数据保存到 localStorage
 * @param {Array} projects - 要保存的项目数组
 */
function saveProjects(projects) {
    // 将对象转换为 JSON 字符串存储
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
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
    if (confirmBtn) confirmBtn.textContent = '✅ 确认创建';
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
    
    // 清空日期选择框
    document.getElementById('modalPlanStartDate').value = '';
    document.getElementById('modalPlanEndDate').value = '';
    document.getElementById('modalActualStartDate').value = '';
    document.getElementById('modalActualEndDate').value = '';
    
    // 重置下拉框为默认值
    document.getElementById('modalPriority').value = '中';
    document.getElementById('modalCategory').value = '工作';
    
    // 清空数字输入框
    document.getElementById('modalBounty').value = '';
}

/**
 * 确认创建项目
 * 验证输入、收集数据、保存到localStorage、刷新列表
 */
function confirmCreateProject() {
    // ① 验证：名称不能为空
    const name = document.getElementById('modalProjectName').value.trim();
    if (!name) {
        alert('请填写项目名称');
        return;
    }
    
    // ② 收集：获取所有8个输入项的值
    const planStartDate = document.getElementById('modalPlanStartDate').value;
    const planEndDate = document.getElementById('modalPlanEndDate').value;
    const actualStartDate = document.getElementById('modalActualStartDate').value;
    const actualEndDate = document.getElementById('modalActualEndDate').value;
    const priority = document.getElementById('modalPriority').value;
    const category = document.getElementById('modalCategory').value;
    const bountyValue = document.getElementById('modalBounty').value;
    // 赏金转换为数字，如果为空则默认为0
    const bounty = bountyValue ? parseFloat(bountyValue) : 0;
    
    const projects = getProjects();
    if (currentEditingProjectId) {
        // 编辑项目模式：更新已有项目
        const project = projects.find(p => p.id === currentEditingProjectId);
        if (project) {
            project.name = name;
            project.planStartDate = planStartDate;
            project.planEndDate = planEndDate;
            project.actualStartDate = actualStartDate;
            project.actualEndDate = actualEndDate;
            project.priority = priority;
            project.category = category;
            project.bounty = bounty;
            saveProjects(projects);
        }
    } else {
        // 新建项目模式
        const newProject = {
            id: Date.now(),
            name,
            planStartDate,
            planEndDate,
            actualStartDate,
            actualEndDate,
            priority,
            category,
            bounty,
            tasks: []
        };
        projects.push(newProject);
        saveProjects(projects);
    }
    
    // ④ 刷新：隐藏浮层，重新渲染项目列表
    closeCreateProjectModal();
    renderProjects();
    
    // ⑤ 清空：下次打开时表单会被resetModalForm()重置
}

// ============================================================
// 项目操作函数 - 增删改查
// ============================================================

// 当前处于编辑模式的项目ID（null 表示新建）
let currentEditingProjectId = null;

// 当前详情浮层的项目ID（null 表示未打开）
let currentDetailProjectId = null;

/**
 * 打开编辑项目浮层（复用新建项目浮层）
 * @param {number} projectId 
 */
function openEditProjectModal(projectId) {
    const projects = getProjects();
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

    // 填充表单
    document.getElementById('modalProjectName').value = project.name || '';
    document.getElementById('modalPlanStartDate').value = project.planStartDate || '';
    document.getElementById('modalPlanEndDate').value = project.planEndDate || '';
    document.getElementById('modalActualStartDate').value = project.actualStartDate || '';
    document.getElementById('modalActualEndDate').value = project.actualEndDate || '';
    document.getElementById('modalPriority').value = project.priority || '中';
    document.getElementById('modalCategory').value = project.category || '工作';
    document.getElementById('modalBounty').value = project.bounty ?? '';

    // 更新标题和按钮文案
    const modal = document.getElementById('createProjectModal');
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '编辑项目';
    const confirmBtn = modal.querySelector('.modal-footer .btn-primary');
    if (confirmBtn) confirmBtn.textContent = '✅ 确认保存';

    // 显示浮层
    modal.style.display = 'flex';
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
function renderProjectDetailContent() {
    if (!currentDetailProjectId) return;
    const projects = getProjects();
    const project = projects.find(p => p.id === currentDetailProjectId);
    if (!project) return;

    // 标题
    const titleEl = document.getElementById('projectDetailTitle');
    if (titleEl) titleEl.textContent = project.name;

    // 元信息（简要展示）
    const metaEl = document.getElementById('projectDetailMeta');
    if (metaEl) {
        metaEl.innerHTML = `
            <div>
                <div>预计：${project.planStartDate || '—'} 至 ${project.planEndDate || '—'}</div>
                <div>实际：${project.actualStartDate || '—'} 至 ${project.actualEndDate || '—'}</div>
                <div>重要度：${project.priority || '—'}　类别：${project.category || '—'}　赏金：${project.bounty ?? 0}</div>
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
                    <button class="btn-edit" onclick="startEditTask(${project.id}, ${task.id})">编辑</button>
                    <button class="btn-danger" onclick="deleteTask(${project.id}, ${task.id}); renderProjectDetailContent();">删除</button>
                </div>
            `).join('');
    }

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
function openAddTaskForProject(projectId) {    // 关闭项目详情浮层并记录返回路径
    const detailModal = document.getElementById('projectDetailModal');
    if (detailModal && detailModal.style.display === 'flex') {
        detailModal.style.display = 'none';
        currentEditingTask.returnToProjectDetail = currentDetailProjectId;
    } else {
        currentEditingTask.returnToProjectDetail = null;
    }
        currentEditingTask.projectId = projectId;
    currentEditingTask.taskId = null; // 新建任务
    // 清空表单
    document.getElementById('modalTaskName').value = '';
    document.getElementById('modalTaskPlanStartDate').value = '';
    document.getElementById('modalTaskPlanEndDate').value = '';
    document.getElementById('modalTaskActualStartDate').value = '';
    document.getElementById('modalTaskActualEndDate').value = '';
    document.getElementById('modalTaskPriority').value = '中';
    // 类别默认继承项目
    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    document.getElementById('modalTaskCategory').value = project?.category || '工作';
    document.getElementById('modalTaskBounty').value = '';
    document.getElementById('modalTaskCompleted').value = 'false';

    // 修改标题为“添加任务”并显示
    const modal = document.getElementById('editTaskModal');
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) titleEl.textContent = '添加任务';
    modal.style.display = 'flex';
}

/**
 * 添加新项目（保留此函数以兼容可能的旧调用，但主要使用浮层方式创建）
 * @deprecated 建议使用 openCreateProjectModal() 和 confirmCreateProject()
 */
function addProject() {
    const input = document.getElementById('projectInput');
    if (!input) return; // 如果输入框不存在，直接返回
    
    const name = input.value.trim();
    
    // 验证输入不为空
    if (!name) {
        alert('请输入项目名称！');
        return;
    }

    // 读取现有项目
    const projects = getProjects();
    
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
function deleteProject(projectId) {
    if (!confirm('确定要删除这个项目吗？所有任务也会被删除！')) {
        return;
    }

    // 读取项目数据
    const projects = getProjects();
    
    // 过滤掉要删除的项目（保留ID不匹配的项目）
    const updatedProjects = projects.filter(p => p.id !== projectId);
    
    // 保存并重新渲染
    saveProjects(updatedProjects);
    renderProjects();
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
function saveProjectName(projectId) {
    const input = document.getElementById(`edit-project-${projectId}`);
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        renderProjects(); // 如果为空，恢复原来的显示
        return;
    }

    // 读取、修改、保存
    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        saveProjects(projects);
    }
    
    renderProjects();
}

// ============================================================
// 任务操作函数 - 增删改查
// ============================================================

/**
 * 添加新任务到指定项目
 * @param {number} projectId - 项目ID
 */
function addTask(projectId) {
    const input = document.getElementById(`task-input-${projectId}`);
    const name = input.value.trim();
    
    if (!name) {
        alert('请输入任务名称！');
        return;
    }

    // 读取项目数据
    const projects = getProjects();
    
    // 找到对应的项目
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
        // 创建新任务对象（完整结构）
        const newTask = {
            id: Date.now(),              // 任务唯一ID
            name: name,                  // 任务名称
            planStartDate: '',           // 预计开始时间（默认为空）
            planEndDate: '',             // 预计结束时间（默认为空）
            actualStartDate: '',         // 实际开始时间（默认为空）
            actualEndDate: '',           // 实际结束时间（默认为空）
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
function deleteTask(projectId, taskId) {
    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
        // 过滤掉要删除的任务
        project.tasks = project.tasks.filter(t => t.id !== taskId);
        saveProjects(projects);
    }
    
    renderProjects();
}

/**
 * 切换任务完成状态
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
function toggleTask(projectId, taskId) {
    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    
    if (project) {
        const task = project.tasks.find(t => t.id === taskId);
        if (task) {
            // 切换完成状态
            task.completed = !task.completed;
            saveProjects(projects);
        }
    }
    
    renderProjects();
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
function openEditTaskModal(projectId, taskId) {
    const projects = getProjects();
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

    // 填充表单数据
    document.getElementById('modalTaskName').value = task.name || '';
    document.getElementById('modalTaskPlanStartDate').value = task.planStartDate || '';
    document.getElementById('modalTaskPlanEndDate').value = task.planEndDate || '';
    document.getElementById('modalTaskActualStartDate').value = task.actualStartDate || '';
    document.getElementById('modalTaskActualEndDate').value = task.actualEndDate || '';
    document.getElementById('modalTaskPriority').value = task.priority || '中';
    document.getElementById('modalTaskCategory').value = task.category || '工作';
    document.getElementById('modalTaskBounty').value = task.bounty || 0;
    document.getElementById('modalTaskCompleted').value = task.completed ? 'true' : 'false';

    // 显示浮层
    document.getElementById('editTaskModal').style.display = 'flex';
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
    document.getElementById('modalTaskActualStartDate').value = '';
    document.getElementById('modalTaskActualEndDate').value = '';
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
 */
function confirmEditTask() {
    // 获取表单数据
    const name = document.getElementById('modalTaskName').value.trim();
    const planStartDate = document.getElementById('modalTaskPlanStartDate').value;
    const planEndDate = document.getElementById('modalTaskPlanEndDate').value;
    const actualStartDate = document.getElementById('modalTaskActualStartDate').value;
    const actualEndDate = document.getElementById('modalTaskActualEndDate').value;
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
    const projects = getProjects();
    const project = projects.find(p => p.id === currentEditingTask.projectId);
    if (project) {
        if (currentEditingTask.taskId) {
            // 编辑任务
            const task = project.tasks.find(t => t.id === currentEditingTask.taskId);
            if (task) {
                task.name = name;
                task.planStartDate = planStartDate;
                task.planEndDate = planEndDate;
                task.actualStartDate = actualStartDate;
                task.actualEndDate = actualEndDate;
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
                actualStartDate,
                actualEndDate,
                priority,
                category,
                bounty,
                completed
            });
        }
        saveProjects(projects);
        renderProjects();
        // 如果详情浮层仍在打开，刷新其中内容
        renderProjectDetailContent();
    }

    // 关闭浮层
    closeEditTaskModal();
}

/**
 * 保存编辑后的任务名称（已废弃，现在使用浮层）
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 */
function saveTaskName(projectId, taskId) {
    const input = document.getElementById(`edit-task-${taskId}`);
    if (!input) return;
    
    const newName = input.value.trim();
    if (!newName) {
        renderProjects();
        return;
    }

    const projects = getProjects();
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    
    if (task) {
        task.name = newName;
        saveProjects(projects);
    }
    
    renderProjects();
}

// ============================================================
// 界面渲染函数
// ============================================================

/**
 * 渲染所有项目到页面
 */
function renderProjects() {
    const container = document.getElementById('projectList');
    const projects = getProjects();

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
// 页面初始化
// ============================================================

// 页面加载完成后渲染项目列表
document.addEventListener('DOMContentLoaded', function() {
    renderProjects();
});
