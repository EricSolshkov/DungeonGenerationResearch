# 给连接器生长添加内容

每个观察窗运行一份规则集和一份模板池。预设记录这两个包的版本键。左右窗共用输入种子，各次生成独立维护随机流、片段计数、待扩张队列和回放。

| 要改的行为 | 对应文件 |
| --- | --- |
| 候选权重、数量上限、扩张顺序、回退和终局条件 | `dist/rulesets/<id>/<version>.js` |
| 局部尺寸、门位、实例变体、局部与世界坐标的换算 | `dist/pools/<id>/<version>.js` |
| 观察窗可选的具名组合 | `dist/presets/` |
| 要载入的包及左右窗默认组合 | `dist/generation/packages.js` |
| 对齐、占用查询、提交片段、队列执行和回放快照 | `dist/generation/driver.js` |

## 增加一版规则或模板

1. 在对应目录建立新的版本文件，调用 `GrowthCatalog.register(kind, definition)`。包键由 `id@version` 组成。需要复现旧实验时保留旧版本文件。
2. 在清单登记类型、键和脚本路径。清单按顺序加载，扩展包列在它依赖的版本后面。已载入的包会出现在两个窗的「规则与模板」中。
3. 若要提供一键切换的组合，在 `presets/` 增加含 `ruleset`、`pool` 两个版本键的预设，并登记到同一清单。

`rulesets/stronghold-experiment/1.0.0.js` 是最小的改权重示例。它引用基线规则工厂，只覆盖 `fiveCrossing` 的权重。两份预设共用 `pools/stronghold-java/1.17.1.js`。

## 大房间要塞

在「连接器生长」的预设下拉框选择「大房间要塞」，展开「规则与模板」可设置目标房间数（1–32，默认 8）。每个观察窗可独立设置。末地传送门房占用一个名额，每张完成的地图恰有一间。起始楼梯、走廊和交叉口均计为通道，包括监牢走廊、五向交叉厅和四向厅的喷泉变体。

普通房间的宽和深在 10–20 米之间，设一至两个门位。图书馆和其他房间内部均留空。传送门房平面为 25 × 25 米，高 40 米。

要从代码复现布局，可运行 `DungeonGenerators.generate('connector-growth', seed, { preset: 'stronghold-large-rooms@1.0.0', roomTarget: 8 })`。结果的 `config` 记录规则集、模板池和实际目标值。

另选「超大房间要塞」（`stronghold-larger-rooms@1.0.0`）可将普通房间的宽和深扩大到 20–30 米，传送门房的平面扩大到 35 × 35 米、高度改为 30 米。两个预设共用房间计数规则，普通房间沿用相同的高度和门数。

「高差要塞」（`stronghold-relief@1.0.0`）沿用超大房间版的传送门房，侧室恢复为 11 × 13 米。主厅有两种，均为 25 × 29 米的空厅。一种有一个入口和一个出口，另一种有一个入口和三个出口，按一间房计数。直梯和螺旋梯的两端相差 12 米，生成时均可从高端接入向下走，也可从低端接入向上走。起始螺旋楼梯同样支持两种方向。

「高差要塞 · 通道裁剪」（`stronghold-relief@1.1.0`）在扩建结束后，从每间房沿父节点回溯到起始楼梯，只保留这些路径经过的片段。全由通道构成的支路会整体移除，原来通向支路的门洞会封闭。回放的「验证目标」阶段显示裁掉的支路数和片段数。使用相同种子和房间数对比两个版本，可以查看裁剪前后的同一张地图。

## 驱动器如何调用规则

- 每次尝试从 `begin({pool, roomTarget})` 取得新状态。`start({pool, random, attempt, state})` 指定起点的模板、位置和朝向。房间数规则在 `begin` 中读取目标值。
- 驱动器按已实例化片段上的门位顺序处理待扩建出口。`next(pending, random)` 指定下一个要扩张的片段索引。`level(startY, exitY)` 给出本次放置的层号。
- `select(ctx)` 使用 `ctx.probe(id, options)` 试放候选。返回对象包含对齐后的体积和首个相交房间索引，`occupied === -1` 表示空闲。规则可继续试放、调用 `ctx.reject` 记录原因、返回 `{stop}` 封口，或返回 `{proposal, role, selection}` 接受候选。
- 接受后驱动器调用池的 `instantiate` 并提交片段、门位和连接。`placed(ctx, room, choice)` 更新本轮规则计数，并返回回放文本。
- 队列耗尽时，`finish({rooms, edges, ports, state, record, ...})` 检查目标，可用 `record` 记录验证过程。返回假值会在同一随机流上重试。达到 `maxAttempts` 后保留最后一轮布局与失败事件。

## 模板池契约

一个池提供 `templates`、`measure(id, options)`、`instantiate(id, random, options)`、`worldPoint(room, local)` 和 `worldSide(facing, localSide)`。每种片段有一个位于水平外壁的 `entry` 门和任意个出口。中央目录按模板 ID 建立索引并冻结包定义。

`measure` 返回试放尺寸，不消耗随机数。`instantiate` 可使用随机流决定已接受片段的局部变体，且应与试放的尺寸和入口位置一致。门位的 `active` 决定是否扩张，`hasOpening` 描述此处实际有无开口。

规则可声明 `requiredTemplates`、`requiredConnectors`（模板 ID 到门位 ID 数组）和 `requiredTags`（池中至少一个模板具备的标签）。目录在生成前检查这些要求。不兼容的选择会在对应观察窗显示缺失项。池可指定 `viewKind: 'stronghold'` 使用要塞视图。默认的空间视图可显示普通房间。

## 复现

记录种子及两个版本键。要与 Java 1.17.1 对照组比较一次规则改动，继续使用同一 `seedDomain`。运行 `node --test tests/*.test.cjs` 可在本目录核对原要塞回放、独立包的组合以及各方向的门位对齐。
