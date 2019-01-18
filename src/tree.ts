import { log } from "./log";
import { Package } from "./package";

/**
 * Models a dependency tree.
 */
export class DepTree<T extends Package> {
  constructor(public pkg: T, public dependencies: DepTree<T>[]) {}

  /**
   * Find those nodes in a tree that do not have dependencies of their own. They
   * are the leaves of the tree.
   *
   * @param collector A `Set` in which to put the leaves.
   */
  findLeaves(collector: Set<DepTree<T>>): void {
    if (this.dependencies.length === 0) {
      collector.add(this);
    }
    else {
      for (const dep of this.dependencies) {
        dep.findLeaves(collector);
      }
    }
  }

  /**
   * Remove nodes and their descendants from a tree. Note that this function
   * does not check the root of the tree being passed.
   *
   * @param tree The tree to modify.
   *
   * @param toRemove An array of nodes to remove.
   */
  removeNodes(toRemove: DepTree<T>[]): void {
    this.dependencies = this.dependencies.filter((dep) => {
      if (toRemove.some(node => dep === node)) {
        return false;
      }

      dep.removeNodes(toRemove);

      return true;
    });
  }
}

/**
 * Dump trees to the console.
 *
 * @param trees The trees to dump.
 */
export function dumpDepTrees(trees: DepTree<Package>[]): void {
  for (const tree of trees) {
    log(JSON.stringify(tree, null, 2));
  }
}

/**
 * Find those nodes in multiple trees that do not have dependencies of their
 * own. They are the leaves of the tree.
 *
 * @param trees The trees to search.
 *
 * @returns A `Set` of nodes.
 */
export function findLeavesInTrees<T extends Package>(trees: DepTree<T>[]):
Set<DepTree<T>> {
  const collector = new Set<DepTree<T>>();
  for (const tree of trees) {
    tree.findLeaves(collector);
  }

  return collector;
}

/**
 * Remove nodes and their descendants from an array of trees. If the root of a
 * tree happens to be a node that should be removed, then the whole tree is
 * removed.
 *
 * @param trees The trees to modify.
 *
 * @param toRemove An array of nodes to remove.
 *
 * @returns The modified trees. As noted above, whole trees may be removed.
 */
export function removeNodesFromTrees<T extends Package>(trees: DepTree<T>[],
                                                        toRemove: DepTree<T>[]):
DepTree<T>[] {
  return trees.filter((tree) => {
    if (toRemove.some(node => node === tree)) {
      return false;
    }

    tree.removeNodes(toRemove);

    return true;
  });
}
