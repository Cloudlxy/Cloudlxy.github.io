/**
 * 让导航（顶部和底部）只显示 _config.landscape.yml 里定义的中文菜单。
 *
 * 背景：Hexo 会把 _config.<主题名>.yml 深合并（deepMerge）进主题自带的配置，
 * 见 hexo/dist/hexo/index.js 里这一行：
 *     ctx.theme.config = deepMerge(ctx.theme.config, ctx.config.theme_config)
 *
 * 深合并只能「新增键」或「覆盖同名键的值」，**无法删除键**。
 * 主题 landscape 自带的 _config.yml 里已经写死了两个英文菜单：
 *     menu:
 *       Home: /
 *       Archives: /archives
 * 所以我们的中文菜单不是替换它，而是和它并排存在，
 * 结果导航里出现 Home / Archives / 首页 / 归档 / 标签 / 分类 六项、两组重复。
 *
 * 这里在每次生成之前把主题自带的英文菜单键删掉。
 * 如果你以后换了主题、或改回用英文菜单，直接删掉本文件即可。
 */
hexo.extend.filter.register('before_generate', () => {
  const menu = hexo.theme.config && hexo.theme.config.menu;
  if (!menu) return;

  ['Home', 'Archives'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(menu, key)) {
      delete menu[key];
    }
  });
});
